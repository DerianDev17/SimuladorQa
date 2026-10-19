import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { createServer } from 'node:net';
import type { Socket, AddressInfo } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { networkEvidence } from '../helpers/network-evidence';
import { networkManagementRequest } from '../helpers/visa-network-management';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { removeTestDirectory } from '../helpers/temporary-directory';

test('el indicador sigue un socket real y ofrece conexión independiente del PIN y lector', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-connection-e2e-'));
  const peers = new Set<Socket>();
  let written = 0;
  const server = createServer((peer) => {
    peers.add(peer);
    peer.once('close', () => peers.delete(peer));
    peer.on('error', () => {});
    peer.on('data', (bytes) => {
      written += bytes.length;
    });
    peer.write(new CapturedVisaFraming().encode(networkManagementRequest(), Buffer.of(0x20, 0x20)));
  });
  let app: ElectronApplication | undefined;
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const evidence = networkEvidence();
    evidence.ingress = { host: '127.0.0.1', port: (server.address() as AddressInfo).port };
    await writeFile(join(directory, 'network-evidence.json'), JSON.stringify(evidence));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    );
    app = await electron.launch({
      args: [resolve('dist/main.cjs'), `--user-data-dir=${directory}`],
      env,
    });
    const window = await app.firstWindow();
    await expect(window.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
    const panel = window.getByRole('region', { name: 'Conexión al Switch', exact: true });
    await expect(panel.getByRole('button', { name: 'Conectar al Switch' })).toBeEnabled();
    expect(peers.size).toBe(0);
    const setup = await window.evaluate(async () => {
      const current = await globalThis.window.desktop!.getSendConfiguration('QA');
      if (!current.ok || !current.value.configuration) throw Error('TEST_CONFIG_UNAVAILABLE');
      return globalThis.window.desktop!.saveSendConfiguration({
        environment: 'QA',
        revision: current.value.configuration.revision,
        values: {
          evidenceId: current.value.configuration.evidenceId,
          trigger: 'ON_CLICK',
          connectDeadlineMs: 1000,
          observationWindowMs: 1000,
        },
      });
    });
    expect(setup.ok).toBe(true);
    await panel.getByRole('button', { name: 'Conectar al Switch' }).click();
    await expect(panel.getByRole('status')).toContainText('TCP conectado');
    await expect(panel).toContainText('Gestión recibida: 0800/072');
    await expect(window.locator('.topbar-network')).toHaveText('TCP conectado');
    await expect.poll(() => peers.size).toBe(1);
    const invalid = await window.evaluate(() =>
      globalThis.window.desktop!.connectSwitch({
        environment: 'QA',
        endpoint: { host: '127.0.0.1', port: 1 },
      } as never),
    );
    expect(invalid.ok).toBe(false);
    for (const peer of peers) peer.end();
    await expect(panel.getByRole('status')).toContainText('Desconectado');
    await expect(panel).toContainText('El servidor cerró la conexión.');
    await panel.getByRole('button', { name: 'Conectar al Switch' }).click();
    await expect(panel.getByRole('status')).toContainText('TCP conectado');
    await panel.getByRole('button', { name: 'Desconectar', exact: true }).click();
    await expect(panel).toContainText('Desconectado por el operador.');
    await panel.getByRole('button', { name: 'Conectar al Switch' }).click();
    await expect(panel.getByRole('status')).toContainText('TCP conectado');
    await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
    await expect.poll(() => peers.size).toBe(0);
    await expect(panel.getByRole('button', { name: 'Conectar al Switch' })).toBeDisabled();
    expect(written).toBe(0);
  } finally {
    await app?.close();
    for (const peer of peers) peer.destroy();
    await new Promise<void>((done) => server.close(() => done()));
    await removeTestDirectory(directory, 'coonecta-connection-e2e-');
  }
});
