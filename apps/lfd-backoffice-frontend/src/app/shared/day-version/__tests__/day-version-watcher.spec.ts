import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAFETY_NET_MS, DayVersionWatcher } from '../day-version-watcher';
import { type DayJournal, DayVersionService } from '../day-version.service';

const TICK = 15_000;

let visibility: DocumentVisibilityState = 'visible';
/** La version servie, par `journal|date` ; `'fail'` fait échouer la lecture. */
let served: Map<string, number | 'fail'>;

function montrerOnglet(state: DocumentVisibilityState): void {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('le veilleur de journée', () => {
  let version: ReturnType<typeof vi.fn<(journal: DayJournal, date: string) => Promise<number>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    served = new Map();
    version = vi.fn(async (journal: DayJournal, date: string) => {
      const value = served.get(`${journal}|${date}`) ?? 0;
      if (value === 'fail') {
        throw new Error('réseau');
      }
      return value;
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: DayVersionService, useValue: { version } }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function brancher(
    journals: readonly DayJournal[],
    date: () => string | null = () => '2026-10-03',
  ): ReturnType<typeof vi.fn<() => Promise<void>>> {
    const reload = vi.fn(async () => undefined);
    const watcher = TestBed.inject(DayVersionWatcher);
    TestBed.runInInjectionContext(() => watcher.watch({ journals, date, reload }));
    return reload;
  }

  it('ne relit rien tant que la version ne bouge pas', async () => {
    served.set('production|2026-10-03', 4);
    const reload = brancher(['production']);

    await vi.advanceTimersByTimeAsync(4 * TICK);

    expect(version).toHaveBeenCalledTimes(4);
    expect(reload).not.toHaveBeenCalled();
  });

  it('relit quand la version change', async () => {
    served.set('production|2026-10-03', 4);
    const reload = brancher(['production']);
    await vi.advanceTimersByTimeAsync(TICK);

    served.set('production|2026-10-03', 5);
    await vi.advanceTimersByTimeAsync(TICK);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  /** 🔴 Le balayage à sept jours fait redescendre la version : c'est un changement. */
  it('🔴 relit quand la version REDESCEND', async () => {
    served.set('commerce|2026-10-03', 9);
    const reload = brancher(['commerce']);
    await vi.advanceTimersByTimeAsync(TICK);

    served.set('commerce|2026-10-03', 0);
    await vi.advanceTimersByTimeAsync(TICK);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('relit si UN des journaux suivis bouge', async () => {
    const reload = brancher(['commerce', 'supervision-production']);
    await vi.advanceTimersByTimeAsync(TICK);

    served.set('supervision-production|2026-10-03', 1);
    await vi.advanceTimersByTimeAsync(TICK);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ne demande rien, ne relit rien, onglet caché', async () => {
    const reload = brancher(['production']);
    visibility = 'hidden';
    served.set('production|2026-10-03', 7);

    await vi.advanceTimersByTimeAsync(2 * SAFETY_NET_MS);

    expect(version).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('repose la question tout de suite quand on revient sur l’onglet', async () => {
    brancher(['production']);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(3 * TICK);

    montrerOnglet('visible');

    expect(version).toHaveBeenCalledTimes(1);
  });

  it('relit toutes les cinq minutes quoi qu’il arrive (le filet)', async () => {
    const reload = brancher(['production']);

    await vi.advanceTimersByTimeAsync(2 * SAFETY_NET_MS);

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('une lecture en échec ne relit pas, et ne perd pas la référence', async () => {
    served.set('production|2026-10-03', 3);
    const reload = brancher(['production']);
    await vi.advanceTimersByTimeAsync(TICK);

    served.set('production|2026-10-03', 'fail');
    await vi.advanceTimersByTimeAsync(2 * TICK);
    expect(reload).not.toHaveBeenCalled();

    served.set('production|2026-10-03', 3);
    await vi.advanceTimersByTimeAsync(TICK);
    expect(reload).not.toHaveBeenCalled();
  });

  it('deux écrans sur la même journée ne posent qu’une question', async () => {
    const first = brancher(['production']);
    const second = brancher(['production']);
    await vi.advanceTimersByTimeAsync(TICK);
    expect(version).toHaveBeenCalledTimes(1);

    served.set('production|2026-10-03', 2);
    await vi.advanceTimersByTimeAsync(TICK);

    expect(version).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('repart sur la nouvelle journée sans relire, puis en suit la version', async () => {
    const date = signal('2026-10-03');
    served.set('commerce|2026-10-03', 5);
    served.set('commerce|2026-10-04', 1);
    const reload = brancher(['commerce'], date);
    await vi.advanceTimersByTimeAsync(TICK);

    date.set('2026-10-04');
    await vi.advanceTimersByTimeAsync(TICK);
    expect(reload).not.toHaveBeenCalled();
    expect(version).toHaveBeenLastCalledWith('commerce', '2026-10-04');

    served.set('commerce|2026-10-04', 2);
    await vi.advanceTimersByTimeAsync(TICK);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  /**
   * Régression V3 : un écran dont le serveur choisit la journée restait sur la
   * veille jusqu'au filet de 5 min — la version d'une date quittée ne bouge plus.
   */
  it('🔴 relit au premier tick après minuit, sans attendre le filet', async () => {
    let today = '2026-10-03';
    const reload = vi.fn(async () => undefined);
    const watcher = TestBed.inject(DayVersionWatcher);
    TestBed.runInInjectionContext(() =>
      watcher.watch({
        journals: ['production'],
        date: () => '2026-10-03',
        reload,
        clockDay: () => today,
      }),
    );
    await vi.advanceTimersByTimeAsync(2 * TICK);
    expect(reload).not.toHaveBeenCalled();

    today = '2026-10-04';
    await vi.advanceTimersByTimeAsync(TICK);
    expect(reload).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * TICK);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ne demande rien tant que la journée n’est pas connue', async () => {
    brancher(['production'], () => null);

    await vi.advanceTimersByTimeAsync(3 * TICK);

    expect(version).not.toHaveBeenCalled();
  });

  it('s’arrête avec l’écran', async () => {
    const reload = brancher(['production']);

    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(2 * SAFETY_NET_MS);
    montrerOnglet('visible');

    expect(version).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
