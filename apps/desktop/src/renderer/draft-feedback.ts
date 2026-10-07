import { isDraftAmount, needsAmount } from '../../../../packages/domain/src/transaction-draft';
import type { TransactionType } from '../../../../packages/domain/src/index';

export interface LocalDraftCheck {
  key: string;
  label: string;
  complete: boolean;
  detail: string;
}
export function localDraftChecks(context: {
  transaction: TransactionType;
  amount: string;
  environmentVerified: boolean;
  atmSelected: boolean;
  catalogAvailable: boolean;
  operationAvailable: boolean;
  original: boolean;
}): LocalDraftCheck[] {
  const checks: LocalDraftCheck[] = [
    {
      key: 'environment',
      label: 'Ambiente identificado',
      complete: context.environmentVerified,
      detail: context.environmentVerified
        ? 'QA o PREPROD verificado por el servicio local.'
        : 'El servicio local todavía no verificó el ambiente.',
    },
    {
      key: 'atm',
      label: 'ATM seleccionado',
      complete: context.atmSelected && context.catalogAvailable,
      detail:
        context.atmSelected && context.catalogAvailable
          ? 'Perfil seleccionado en borrador; requiere validación QA.'
          : context.catalogAvailable
            ? 'Selecciona un ATM activo de este ambiente.'
            : 'Carga los perfiles para verificar la selección.',
    },
    {
      key: 'operation',
      label: context.original ? 'Original del reverso' : 'Operación documentada',
      complete: !context.original && context.operationAvailable,
      detail: context.original
        ? 'Requiere transacción original y reglas aprobadas.'
        : context.operationAvailable
          ? 'Cuenta y código disponibles en el catálogo documental.'
          : 'Falta una combinación documentada de operación y cuenta.',
    },
  ];
  if (needsAmount(context.transaction))
    checks.push({
      key: 'amount',
      label: 'Formato del monto',
      complete: isDraftAmount(context.amount),
      detail: isDraftAmount(context.amount)
        ? 'Dos decimales válidos; elegibilidad financiera pendiente.'
        : 'Escribe el monto con punto y dos decimales.',
    });
  return checks;
}
