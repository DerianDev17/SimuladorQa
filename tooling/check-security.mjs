import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const findings = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (['node_modules', 'dist', '.git', 'test-results', 'artifacts'].includes(entry.name))
      continue;
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (/^(\.env)(\.|$)|\.(pem|key|p12|pfx)$/i.test(entry.name))
      findings.push(`Archivo sensible: ${path}`);
    if (!/\.(ts|tsx|js|mjs|json|ps1)$/.test(entry.name) || entry.name === 'package-lock.json')
      continue;
    const text = await readFile(path, 'utf8');
    if (/\b\d{12,19}\b/.test(text)) findings.push(`Posible PAN literal: ${path}`);
    if (/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
      findings.push(`Llave privada: ${path}`);
    if (
      /\b(password|secret|zpk|apiKey)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(text) &&
      !path.startsWith('tests')
    )
      findings.push(`Posible secreto literal: ${path}`);
  }
}
await scan('.');
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else console.log('Sin archivos sensibles, PAN literales ni llaves privadas detectadas.');
