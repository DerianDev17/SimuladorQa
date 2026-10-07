import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  isRevision,
  isUtcTimestamp,
  isUuid,
  parseAtmValues,
  parseEntityValues,
  parseSaveAtmRequest,
  parseSaveEntityRequest,
  parseDeleteRequest,
} from '../../../../../packages/domain/src/catalogs';
import type {
  AtmProfile,
  CatalogAudit,
  CatalogSnapshot,
  Entity,
  CatalogRecord,
} from '../../../../../packages/domain/src/catalogs';
import { isEnvironment, isRecord } from '../../../../../packages/domain/src/index';
import type { Environment } from '../../../../../packages/domain/src/index';
import { failure } from '../../../../../packages/shared/src/contracts';
import type { ErrorCode, Result } from '../../../../../packages/shared/src/contracts';
import type {
  CatalogCommand,
  CatalogContext,
} from '../../../../../packages/shared/src/catalog-worker';

class CatalogFault extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const schema = `
CREATE TABLE entities (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  network_type TEXT NOT NULL CHECK (network_type IN ('COONECTA','BANRED','EXTERNAL')),
  active INTEGER NOT NULL CHECK(active IN (0,1)), revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE atm_profiles (
  id TEXT PRIMARY KEY, alias TEXT NOT NULL, entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK(environment IN ('QA','PREPROD')),
  terminal_id TEXT NOT NULL, acquirer_id TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)), revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(environment, terminal_id)
) STRICT;
CREATE INDEX atm_entity ON atm_profiles(entity_id);
CREATE TABLE catalog_audit (
  sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, timestamp TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('QA','PREPROD')),
  actor TEXT NOT NULL, machine TEXT NOT NULL,
  resource TEXT NOT NULL CHECK(resource IN ('ENTITY','ATM')), record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('CREATED','UPDATED','DELETED'))
) STRICT;
PRAGMA user_version = 1;`;

function record(row: Record<string, unknown>): CatalogRecord {
  if (
    !isUuid(row.id) ||
    !isRevision(row.revision) ||
    !isUtcTimestamp(row.created_at) ||
    !isUtcTimestamp(row.updated_at)
  )
    throw new Error('INVALID_CATALOG_RECORD');
  return {
    id: row.id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: 'DRAFT',
  };
}
function entity(row: Record<string, unknown>): Entity {
  const values = parseEntityValues({
    code: row.code,
    name: row.name,
    networkType: row.network_type,
    active: row.active === 1,
  });
  if (!values || (row.active !== 0 && row.active !== 1)) throw new Error('INVALID_ENTITY');
  return { ...record(row), ...values };
}
function atm(row: Record<string, unknown>): AtmProfile {
  const values = parseAtmValues({
    alias: row.alias,
    entityId: row.entity_id,
    terminalId: row.terminal_id,
    acquirerId: row.acquirer_id,
    active: row.active === 1,
  });
  if (!values || !isEnvironment(row.environment) || (row.active !== 0 && row.active !== 1))
    throw new Error('INVALID_ATM');
  return { ...record(row), ...values, environment: row.environment };
}

export class SqliteCatalog {
  private readonly database: DatabaseSync;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.database = new DatabaseSync(file, {
      timeout: 500,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    });
    try {
      this.database.exec('BEGIN IMMEDIATE');
      const version = this.database.prepare('PRAGMA user_version').get()?.user_version;
      if (version === 0) this.database.exec(schema);
      else if (version !== 1) throw new Error('UNSUPPORTED_SCHEMA');
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.close();
      throw new Error('STORAGE_UNAVAILABLE', { cause: error });
    }
  }

  private list(environment: Environment): CatalogSnapshot {
    const entities = this.database
      .prepare('SELECT * FROM entities ORDER BY code, id')
      .all()
      .map(entity);
    const atms = this.database
      .prepare('SELECT * FROM atm_profiles WHERE environment = ? ORDER BY alias, id')
      .all(environment)
      .map(atm);
    const audit = this.database
      .prepare('SELECT * FROM catalog_audit ORDER BY sequence DESC LIMIT 100')
      .all()
      .map((row): CatalogAudit => {
        if (
          !isUuid(row.id) ||
          !isUuid(row.record_id) ||
          !isUtcTimestamp(row.timestamp) ||
          !isEnvironment(row.environment) ||
          typeof row.actor !== 'string' ||
          typeof row.machine !== 'string' ||
          (row.resource !== 'ENTITY' && row.resource !== 'ATM') ||
          !['CREATED', 'UPDATED', 'DELETED'].includes(String(row.action))
        )
          throw new Error('INVALID_AUDIT');
        return {
          id: row.id,
          timestamp: row.timestamp,
          environment: row.environment,
          user: row.actor,
          machine: row.machine,
          resource: row.resource,
          recordId: row.record_id,
          action: row.action as CatalogAudit['action'],
        };
      });
    return { environment, entities, atms, audit };
  }

  private audit(
    context: CatalogContext,
    environment: Environment,
    resource: 'ENTITY' | 'ATM',
    id: string,
    action: CatalogAudit['action'],
  ): void {
    this.database
      .prepare(
        'INSERT INTO catalog_audit (id,timestamp,environment,actor,machine,resource,record_id,action) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        context.timestamp,
        environment,
        context.user,
        context.machine,
        resource,
        id,
        action,
      );
    this.database.exec(
      'DELETE FROM catalog_audit WHERE sequence NOT IN (SELECT sequence FROM catalog_audit ORDER BY sequence DESC LIMIT 1000)',
    );
  }

  private existing(
    table: 'entities' | 'atm_profiles',
    id: string,
    revision: number | null,
    environment?: Environment,
  ): Record<string, unknown> {
    const row = this.database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row || (environment && row.environment !== environment))
      throw new CatalogFault('NOT_FOUND', 'El registro ya no está disponible en este ambiente.');
    if (row.revision !== revision)
      throw new CatalogFault(
        'CONFLICT',
        'El registro cambió. Recarga el catálogo antes de editarlo.',
      );
    return row;
  }

  execute(command: CatalogCommand, context: CatalogContext): Result<CatalogSnapshot> {
    let inTransaction = false;
    try {
      if (
        !isUtcTimestamp(context.timestamp) ||
        typeof context.user !== 'string' ||
        typeof context.machine !== 'string'
      )
        throw new CatalogFault('VALIDATION_ERROR', 'Contexto de auditoría inválido.');
      const environment =
        command.kind === 'list' ? command.environment : command.request.environment;
      if (!isEnvironment(environment))
        throw new CatalogFault('VALIDATION_ERROR', 'Selecciona QA o PREPROD.');
      this.database.exec(command.kind === 'list' ? 'BEGIN' : 'BEGIN IMMEDIATE');
      inTransaction = true;
      switch (command.kind) {
        case 'list':
          break;
        case 'saveEntity': {
          const request = parseSaveEntityRequest(command.request);
          if (!request)
            throw new CatalogFault('VALIDATION_ERROR', 'Revisa los campos de la entidad.');
          const { values, id, revision } = request;
          if (id) this.existing('entities', id, revision);
          const duplicate = this.database
            .prepare('SELECT id FROM entities WHERE code = ? AND id != ?')
            .get(values.code, id ?? '');
          if (duplicate)
            throw new CatalogFault('VALIDATION_ERROR', 'Ya existe una entidad con ese código.');
          const recordId = id ?? randomUUID();
          if (id)
            this.database
              .prepare(
                'UPDATE entities SET code=?,name=?,network_type=?,active=?,revision=revision+1,updated_at=? WHERE id=?',
              )
              .run(
                values.code,
                values.name,
                values.networkType,
                Number(values.active),
                context.timestamp,
                id,
              );
          else
            this.database
              .prepare('INSERT INTO entities VALUES (?,?,?,?,?,?,?,?)')
              .run(
                recordId,
                values.code,
                values.name,
                values.networkType,
                Number(values.active),
                1,
                context.timestamp,
                context.timestamp,
              );
          this.audit(context, environment, 'ENTITY', recordId, id ? 'UPDATED' : 'CREATED');
          break;
        }
        case 'saveAtm': {
          const request = parseSaveAtmRequest(command.request);
          if (!request)
            throw new CatalogFault('VALIDATION_ERROR', 'Revisa los campos del perfil ATM.');
          const { values, id, revision } = request;
          const previous = id
            ? this.existing('atm_profiles', id, revision, environment)
            : undefined;
          const owner = this.database
            .prepare('SELECT * FROM entities WHERE id = ?')
            .get(values.entityId);
          if (!owner)
            throw new CatalogFault('VALIDATION_ERROR', 'Selecciona una entidad existente.');
          if (
            owner.active !== 1 &&
            (!previous || values.active || previous.entity_id !== values.entityId)
          )
            throw new CatalogFault(
              'VALIDATION_ERROR',
              'Selecciona una entidad activa para este perfil.',
            );
          if (
            this.database
              .prepare(
                'SELECT id FROM atm_profiles WHERE environment = ? AND terminal_id = ? AND id != ?',
              )
              .get(environment, values.terminalId, id ?? '')
          )
            throw new CatalogFault(
              'VALIDATION_ERROR',
              'Ya existe ese Terminal ID en el ambiente seleccionado.',
            );
          const recordId = id ?? randomUUID();
          if (id)
            this.database
              .prepare(
                'UPDATE atm_profiles SET alias=?,entity_id=?,terminal_id=?,acquirer_id=?,active=?,revision=revision+1,updated_at=? WHERE id=?',
              )
              .run(
                values.alias,
                values.entityId,
                values.terminalId,
                values.acquirerId,
                Number(values.active),
                context.timestamp,
                id,
              );
          else
            this.database
              .prepare('INSERT INTO atm_profiles VALUES (?,?,?,?,?,?,?,?,?,?)')
              .run(
                recordId,
                values.alias,
                values.entityId,
                environment,
                values.terminalId,
                values.acquirerId,
                Number(values.active),
                1,
                context.timestamp,
                context.timestamp,
              );
          this.audit(context, environment, 'ATM', recordId, id ? 'UPDATED' : 'CREATED');
          break;
        }
        case 'deleteEntity':
        case 'deleteAtm': {
          const request = parseDeleteRequest(command.request);
          if (!request)
            throw new CatalogFault('VALIDATION_ERROR', 'Solicitud de eliminación inválida.');
          const resource = command.kind === 'deleteEntity' ? 'ENTITY' : 'ATM';
          const table = resource === 'ENTITY' ? 'entities' : 'atm_profiles';
          this.existing(
            table,
            request.id,
            request.revision,
            resource === 'ATM' ? environment : undefined,
          );
          if (
            resource === 'ENTITY' &&
            this.database
              .prepare('SELECT id FROM atm_profiles WHERE entity_id = ? LIMIT 1')
              .get(request.id)
          )
            throw new CatalogFault(
              'IN_USE',
              'La entidad tiene perfiles ATM asociados. Elimínalos o reasígnalos primero.',
            );
          this.database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(request.id);
          this.audit(context, environment, resource, request.id, 'DELETED');
          break;
        }
      }
      const snapshot = this.list(environment);
      this.database.exec('COMMIT');
      inTransaction = false;
      return { ok: true, value: snapshot };
    } catch (error) {
      if (inTransaction) {
        try {
          this.database.exec('ROLLBACK');
        } catch {
          /* La conexión puede haberse cerrado. */
        }
      }
      if (error instanceof CatalogFault) return failure(error.code, error.message);
      if (isRecord(error) && (error.errcode === 5 || error.errcode === 6))
        return failure('TIMEOUT', 'El catálogo está ocupado. Recarga antes de reintentar.');
      return failure(
        'STORAGE_UNAVAILABLE',
        'No se pudo leer o guardar el catálogo local. Revisa su integridad y permisos.',
      );
    }
  }

  close(): void {
    this.database.close();
  }
}
