import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffNotificationsService } from '../staff-notifications.service';
import { StaffNotificationsStore } from '../staff-notifications.store';

let visibility: DocumentVisibilityState = 'visible';

describe('la cloche de l’équipe', () => {
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

  function brancher(): ReturnType<typeof vi.fn> {
    const summary = vi.fn(async () => ({ notifications: [] }));
    TestBed.configureTestingModule({
      providers: [{ provide: StaffNotificationsService, useValue: { summary } }],
    });
    TestBed.inject(StaffNotificationsStore);
    return summary;
  }

  /**
   * Régression 2026-09-28 : la cloche relisait toutes les 60 s même onglet
   * caché — un back-office oublié interrogeait la base toute la nuit.
   */
  it('ne relit pas un onglet caché', async () => {
    const summary = brancher();
    await vi.advanceTimersByTimeAsync(0);
    visibility = 'hidden';

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(summary).toHaveBeenCalledTimes(1);
  });

  it('relit chaque minute tant que l’onglet est visible', async () => {
    const summary = brancher();

    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect(summary).toHaveBeenCalledTimes(4);
  });
});
