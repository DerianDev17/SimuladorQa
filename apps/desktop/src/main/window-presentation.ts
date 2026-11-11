export type WindowPresentation = 'background' | 'minimized' | 'hidden';

export function developmentWindowPresentation(args: readonly string[]): WindowPresentation {
  const argument = args.find((value) => value.startsWith('--dev-window-state='));
  const state = argument?.slice('--dev-window-state='.length);
  return state === 'minimized' || state === 'hidden' ? state : 'background';
}

interface WindowPresenter {
  isMinimized(): boolean;
  showInactive(): void;
  minimize(): void;
}

// Automatic lifecycle events must not activate or restore the user's window.
export function presentWindow(window: WindowPresenter, state: WindowPresentation): void {
  // ready-to-show may arrive after the user has already minimized the window.
  if (state === 'hidden' || window.isMinimized()) return;
  if (state === 'minimized') window.minimize();
  else window.showInactive();
}
