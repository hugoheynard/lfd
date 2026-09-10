import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, HandoverQueueWindowView } from '@lfd/contracts';

import {
  ALL_PICKUPS,
  NO_PICKUP,
  entriesForTab,
  formatHour,
  formatWindow,
  isLate,
  pickupTabs,
  rowTone,
  sortedQueue,
} from './handover-queue';

/**
 * Les quatre règles de la file, éprouvées hors de tout gabarit :
 *
 * - **une ligne sans créneau ne disparaît pas et n'hérite d'aucune heure** —
 *   c'est le cas de masse depuis le backfill du 2026-08-15 ;
 * - **une borne basse absente s'écrit seule** (`6 h 30`), pas `— – 6 h 30` ;
 * - 🔴 **un créneau `default` n'autorise pas à parler de retard** : c'est
 *   l'ouverture du point, pas une promesse — le calculer dessus allumerait tout
 *   le portefeuille d'un coup ;
 * - **les onglets sont dérivés**, jamais écrits, et aucune ligne ne tombe
 *   hors de tous.
 */

/** Le jour de service de toutes les fixtures. Il n'est comparé qu'à des heures
 *  fournies par le test lui-même — jamais à l'horloge. */
const DAY = '2026-09-10';

function window(over: Partial<HandoverQueueWindowView> = {}): HandoverQueueWindowView {
  return { start: '06:00', end: '08:00', source: 'override', ...over };
}

function entry(over: Partial<HandoverQueueEntryView> = {}): HandoverQueueEntryView {
  return {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    pickupLabel: 'Laboratoire',
    fulfillmentMethod: 'pickup',
    window: window(),
    totalUnits: 12,
    placedAt: `${DAY}T05:00:00.000Z`,
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    ...over,
  };
}

describe('pickupTabs', () => {
  it('dérive un onglet par point présent, compté, sans nom écrit en dur', () => {
    const tabs = pickupTabs([
      entry({ orderId: 'a', pickupLabel: 'Val Thorens' }),
      entry({ orderId: 'b', pickupLabel: 'Laboratoire' }),
      entry({ orderId: 'c', pickupLabel: 'Laboratoire' }),
    ]);

    expect(tabs.map((tab) => tab.key)).toEqual([ALL_PICKUPS, 'Laboratoire', 'Val Thorens']);
    expect(tabs.map((tab) => tab.count)).toEqual([3, 2, 1]);
  });

  it('un seul point ne fabrique pas un onglet « Tous » qui ferait doublon', () => {
    const tabs = pickupTabs([entry({ orderId: 'a' }), entry({ orderId: 'b' })]);

    expect(tabs).toEqual([{ key: 'Laboratoire', label: 'Laboratoire', count: 2 }]);
  });

  it('les lignes sans point de retrait ont leur onglet — sinon elles seraient hors de tous', () => {
    const tabs = pickupTabs([
      entry({ orderId: 'a' }),
      entry({ orderId: 'b', pickupLabel: null, fulfillmentMethod: 'delivery' }),
    ]);

    expect(tabs.map((tab) => tab.key)).toEqual([ALL_PICKUPS, 'Laboratoire', NO_PICKUP]);
    expect(entriesForTab([entry({ orderId: 'b', pickupLabel: null })], NO_PICKUP)).toHaveLength(1);
  });

  it('aucune ligne ne tombe hors de tous les onglets', () => {
    const entries = [
      entry({ orderId: 'a', pickupLabel: 'Laboratoire' }),
      entry({ orderId: 'b', pickupLabel: null }),
      entry({ orderId: 'c', pickupLabel: '   ' }),
    ];
    const tabs = pickupTabs(entries).filter((tab) => tab.key !== ALL_PICKUPS);

    const seen = new Set(
      tabs.flatMap((tab) => entriesForTab(entries, tab.key).map((row) => row.orderId)),
    );
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('sortedQueue', () => {
  it('ordonne par créneau, puis par heure de commande', () => {
    const rows = sortedQueue([
      entry({ orderId: 'tard', window: window({ start: '09:00', end: '10:00' }) }),
      entry({ orderId: 'tot-2', window: window(), placedAt: `${DAY}T06:00:00.000Z` }),
      entry({ orderId: 'tot-1', window: window(), placedAt: `${DAY}T04:00:00.000Z` }),
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(['tot-1', 'tot-2', 'tard']);
  });

  it('une borne basse absente se range sur sa borne haute, faute d’autre chose', () => {
    const rows = sortedQueue([
      entry({ orderId: 'plage', window: window({ start: '07:00', end: '09:00' }) }),
      entry({ orderId: 'avant', window: window({ start: null, end: '06:30' }) }),
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(['avant', 'plage']);
  });

  it('🔴 une ligne SANS créneau descend en fin de file, sans heure inventée', () => {
    const rows = sortedQueue([
      entry({ orderId: 'sans', window: null }),
      entry({ orderId: 'avec', window: window({ start: '23:00', end: '23:30' }) }),
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(['avec', 'sans']);
    expect(rows[1]?.window).toBeNull();
  });
});

describe('formatWindow', () => {
  it('écrit une tranche complète en heures françaises', () => {
    expect(formatWindow(window({ start: '06:30', end: '08:00' }))).toBe(
      '6\u00a0h\u00a030 – 8\u00a0h\u00a000',
    );
  });

  it('🔴 sans borne basse, rend l’heure SEULE — pas « — – 6 h 30 »', () => {
    const written = formatWindow(window({ start: null, end: '06:30' }));

    expect(written).toBe('6\u00a0h\u00a030');
    expect(written).not.toContain('–');
  });

  it('sans créneau, ne rend rien plutôt qu’une heure', () => {
    expect(formatWindow(null)).toBeNull();
  });

  it('rend telle quelle une valeur qu’elle ne sait pas lire', () => {
    expect(formatHour('bientôt')).toBe('bientôt');
  });
});

describe('isLate', () => {
  const passed = new Date(`${DAY}T09:00:00`);

  it('🔴 ne parle JAMAIS de retard sur un créneau `default`', () => {
    const line = entry({ window: window({ source: 'default', end: '08:00' }) });

    expect(isLate(line, DAY, passed)).toBe(false);
  });

  it('parle de retard sur une tranche réellement demandée et dépassée', () => {
    const line = entry({ window: window({ source: 'override', end: '08:00' }) });

    expect(isLate(line, DAY, passed)).toBe(true);
  });

  it('se tait avant la fin de la tranche', () => {
    const line = entry({ window: window({ source: 'override', end: '08:00' }) });

    expect(isLate(line, DAY, new Date(`${DAY}T07:30:00`))).toBe(false);
  });

  it('se tait sans créneau — il n’y a rien à dépasser', () => {
    expect(isLate(entry({ window: null }), DAY, passed)).toBe(false);
  });

  it('se tait sur une commande remise ou annulée : l’heure ne promet plus rien', () => {
    expect(isLate(entry({ state: 'handed_over' }), DAY, passed)).toBe(false);
    expect(isLate(entry({ state: 'cancelled' }), DAY, passed)).toBe(false);
  });
});

describe('rowTone', () => {
  it('l’annulation gagne sur le retard', () => {
    const line = entry({
      state: 'cancelled',
      window: window({ source: 'override', end: '08:00' }),
    });

    expect(rowTone(line, DAY, new Date(`${DAY}T09:00:00`))).toBe('alert');
  });

  it('une ligne ordinaire ne porte aucun ton', () => {
    expect(rowTone(entry({ window: null }), DAY, new Date(`${DAY}T09:00:00`))).toBeNull();
  });
});
