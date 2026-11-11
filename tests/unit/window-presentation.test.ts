import { describe, expect, it, vi } from 'vitest';
import {
  developmentWindowPresentation,
  presentWindow,
} from '../../apps/desktop/src/main/window-presentation';

describe('presentación de ventana sin activar', () => {
  it('muestra un arranque normal sin pedir foco', () => {
    const window = { isMinimized: () => false, showInactive: vi.fn(), minimize: vi.fn() };
    presentWindow(window, 'background');
    expect(window.showInactive).toHaveBeenCalledOnce();
    expect(window.minimize).not.toHaveBeenCalled();
  });
  it('recupera minimizada sin mostrarla primero y conserva una ventana oculta', () => {
    const window = { isMinimized: () => false, showInactive: vi.fn(), minimize: vi.fn() };
    presentWindow(window, 'minimized');
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.showInactive).not.toHaveBeenCalled();
    presentWindow(window, 'hidden');
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.showInactive).not.toHaveBeenCalled();
  });
  it('respeta la minimización del usuario si ready-to-show llega tarde', () => {
    const window = { isMinimized: () => true, showInactive: vi.fn(), minimize: vi.fn() };
    presentWindow(window, 'background');
    expect(window.showInactive).not.toHaveBeenCalled();
    expect(window.minimize).not.toHaveBeenCalled();
  });
  it.each(['minimized', 'hidden', 'background'] as const)(
    'acepta estado %s del lanzador',
    (state) => {
      expect(developmentWindowPresentation([`--dev-window-state=${state}`])).toBe(state);
    },
  );
  it.each(
    [[], ['--dev-window-state=focus'], ['--dev-window-state='], ['--dev-other=hidden']].map(
      (args) => ({ args }),
    ),
  )('un argumento ausente o inválido no autoriza activación: $args', ({ args }) => {
    expect(developmentWindowPresentation(args)).toBe('background');
  });
});
