import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshWhileVisible } from '../periodic-refresh';

let visibility: DocumentVisibilityState = 'visible';

function montrerOnglet(state: DocumentVisibilityState): void {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('la relecture tant que l’onglet est visible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function brancher(refresh: () => Promise<void>): void {
    TestBed.runInInjectionContext(() => refreshWhileVisible(refresh, 1000));
  }

  it('relit à chaque intervalle', async () => {
    const refresh = vi.fn(async () => undefined);
    brancher(refresh);

    await vi.advanceTimersByTimeAsync(3000);

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('ne relit pas un onglet caché', async () => {
    const refresh = vi.fn(async () => undefined);
    brancher(refresh);
    visibility = 'hidden';

    await vi.advanceTimersByTimeAsync(5000);

    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * 🔴 Un poste retrouvé après deux heures ne doit pas montrer quinze secondes
   * de périmé à qui s'y fie.
   */
  it('🔴 relit tout de suite quand on revient sur l’onglet', async () => {
    const refresh = vi.fn(async () => undefined);
    brancher(refresh);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(5000);

    montrerOnglet('visible');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ne lance jamais deux relectures en même temps', async () => {
    let finish: () => void = () => undefined;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    brancher(refresh);

    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('s’arrête avec l’écran', async () => {
    const refresh = vi.fn(async () => undefined);
    brancher(refresh);

    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(5000);
    montrerOnglet('visible');

    expect(refresh).not.toHaveBeenCalled();
  });
});
