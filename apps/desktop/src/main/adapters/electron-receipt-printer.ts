import { BrowserWindow } from 'electron';
import type { ReceiptPrinter } from '../withdrawal-receipt-service';
import type {
  ReceiptPrintStatus,
  WithdrawalReceipt,
} from '../../../../../packages/domain/src/withdrawal-receipt';
import { withdrawalReceiptHtml } from './withdrawal-receipt-html';

export class ElectronReceiptPrinter implements ReceiptPrinter {
  constructor(private readonly parent: () => BrowserWindow | null) {}

  async print(receipt: WithdrawalReceipt, signal: AbortSignal): Promise<ReceiptPrintStatus> {
    const parent = this.parent();
    if (!parent || parent.isDestroyed() || signal.aborted) throw Error('PRINT_UNAVAILABLE');
    const preview = new BrowserWindow({
      parent,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        javascript: false,
        webSecurity: true,
      },
    });
    const close = () => {
      if (!preview.isDestroyed()) preview.destroy();
    };
    signal.addEventListener('abort', close, { once: true });
    parent.once('closed', close);
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    preview.webContents.on('will-navigate', (event) => event.preventDefault());
    preview.webContents.on('will-attach-webview', (event) => event.preventDefault());
    try {
      await preview.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(withdrawalReceiptHtml(receipt))}`,
      );
      if (signal.aborted || preview.isDestroyed()) throw Error('PRINT_CANCELLED');
      return await new Promise<ReceiptPrintStatus>((resolve, reject) => {
        preview.once('closed', () => reject(Error('PRINT_CLOSED')));
        preview.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
          if (success) resolve('SUBMITTED');
          else if (reason === 'cancelled' || reason === 'Print job canceled') resolve('CANCELLED');
          else reject(Error('PRINT_UNAVAILABLE'));
        });
      });
    } finally {
      signal.removeEventListener('abort', close);
      parent.removeListener('closed', close);
      close();
    }
  }
}
