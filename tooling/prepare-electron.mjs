import electronPath from 'electron';
import { access } from 'node:fs/promises';

// La descarga inicial debe terminar antes de iniciar los timeouts de los tests.
await access(electronPath);
console.log('Runtime Electron disponible.');
