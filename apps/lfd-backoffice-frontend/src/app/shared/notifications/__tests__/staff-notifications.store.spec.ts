import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  StaffNotificationsSummary,
  StaffNotificationView,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MyStaffNotificationsService } from '../my-staff-notifications.service';
import { StaffNotificationsService } from '../staff-notifications.service';
import { StaffNotificationsStore } from '../staff-notifications.store';

/** Les droits de la personne connectée, déjà lus. */
function permissionsOf(...held: readonly StaffPermission[]) {
  return {
    ensureLoaded: () => Promise.resolve(),
    can: (permission: StaffPermission) => held.includes(permission),
  } satisfies Pick<PermissionsStore, 'ensureLoaded' | 'can'>;
}

const NOTHING: StaffNotificationsSummary = { unread: 0, notifications: [] };

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
      providers: [
        { provide: StaffNotificationsService, useValue: { summary } },
        { provide: MyStaffNotificationsService, useValue: { summary: async () => NOTHING } },
        { provide: PermissionsStore, useValue: permissionsOf('staff_notifications:read') },
      ],
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

function notice(id: string, occurredAt: string): StaffNotificationView {
  return {
    id,
    kind: 'delivery.stop_decision',
    subject: `Sujet ${id}`,
    body: 'Une ligne.',
    link: '/livraison/a-decider',
    occurredAt,
    readAt: null,
    readBy: null,
    readByName: null,
  };
}

/**
 * Les deux fils de la cloche (`plan-a-la-porte.md`, B5) : « mes
 * notifications » pour tout staff, le fil partagé seulement avec son droit.
 */
describe('la cloche, deux fils', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  function wire(held: readonly StaffPermission[]) {
    const calls: string[] = [];
    const shared = {
      summary: async (): Promise<StaffNotificationsSummary> => {
        calls.push('partagé');
        return { unread: 1, notifications: [notice('p1', '2030-03-12T08:00:00.000Z')] };
      },
      markRead: async (id: string) => {
        calls.push(`partagé lu ${id}`);
      },
      markAllRead: async () => {
        calls.push('partagé tout lu');
      },
    } satisfies Pick<StaffNotificationsService, 'summary' | 'markRead' | 'markAllRead'>;
    const mine = {
      summary: async (): Promise<StaffNotificationsSummary> => {
        calls.push('à moi');
        return { unread: 1, notifications: [notice('m1', '2030-03-12T09:00:00.000Z')] };
      },
      markRead: async (id: string) => {
        calls.push(`à moi lu ${id}`);
      },
      markAllRead: async () => {
        calls.push('à moi tout lu');
      },
    } satisfies Pick<MyStaffNotificationsService, 'summary' | 'markRead' | 'markAllRead'>;
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffNotificationsService, useValue: shared },
        { provide: MyStaffNotificationsService, useValue: mine },
        { provide: PermissionsStore, useValue: permissionsOf(...held) },
      ],
    });
    return { store: TestBed.inject(StaffNotificationsStore), calls };
  }

  it('🔴 sans `staff_notifications:read`, le fil partagé n’est jamais appelé — un livreur', async () => {
    const { store, calls } = wire(['delivery_driving:read']);
    await store.refresh();

    expect(calls).not.toContain('partagé');
    expect(store.items().map((item) => item.id)).toEqual(['m1']);
    store.markAllRead();
    expect(calls).not.toContain('partagé tout lu');
  });

  it('avec le droit, les deux fils en une liste, du plus récent au plus ancien', async () => {
    const { store } = wire(['staff_notifications:read']);
    await store.refresh();

    expect(store.items().map((item) => item.id)).toEqual(['m1', 'p1']);
    expect(store.unread()).toBe(2);
  });

  it('chaque notice se marque lue dans SON fil', async () => {
    const { store, calls } = wire(['staff_notifications:read']);
    await store.refresh();

    store.markRead('m1');
    store.markRead('p1');

    expect(calls).toContain('à moi lu m1');
    expect(calls).toContain('partagé lu p1');
    expect(store.unread()).toBe(0);
  });
});
