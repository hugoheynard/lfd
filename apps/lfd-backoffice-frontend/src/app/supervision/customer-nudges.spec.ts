import type { CustomerNudgesView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { rowNudgeOf } from './customer-nudges';
import type { SlotRow } from './handover-slots';

/** Un retrait au créneau dépassé de 20 min, prêt, client pas venu. */
function row(over: Partial<SlotRow> = {}): SlotRow {
  return {
    orderId: 'order_1',
    reference: 'ORD-4812',
    customerLabel: 'Camille',
    state: 'overdue',
    time: '7 h 00',
    totalUnits: 3,
    pickupLabel: 'Le Labo',
    handedOverAt: null,
    readyAt: '6 h 48',
    overdueMinutes: 20,
    overdueCause: 'customer',
    method: 'pickup',
    heldForQuality: false,
    roundLine: null,
    departedAt: null,
    loaded: false,
    ...over,
  };
}

function nudges(over: Partial<CustomerNudgesView> = {}): CustomerNudgesView {
  return {
    date: '2026-09-11',
    pickupReminderDelayMinutes: 15,
    delayWarningDelayMinutes: 5,
    orders: [],
    ...over,
  };
}

const NOT_READY = { readyAt: null, overdueCause: 'kitchen' } as const;

describe('rowNudgeOf', () => {
  it('prête et le client pas venu : « Rappel au client », passé son délai', () => {
    expect(rowNudgeOf(row(), nudges())).toEqual({ kind: 'remind' });
    expect(rowNudgeOf(row({ overdueMinutes: 14 }), nudges())).toBeNull();
  });

  it('pas prête : « Avertir le client », avec SON délai — jamais les deux', () => {
    expect(rowNudgeOf(row({ ...NOT_READY, overdueMinutes: 5 }), nudges())).toEqual({
      kind: 'warn',
    });
    expect(rowNudgeOf(row({ ...NOT_READY, overdueMinutes: 4 }), nudges())).toBeNull();
  });

  it('déjà fait : la trace remplace le bouton, avec qui et quand', () => {
    const view = nudges({
      orders: [
        {
          orderId: 'order_1',
          pickupReminder: { at: '2026-09-11T06:20:00.000Z', byName: 'Léa Martin' },
          delayWarning: { at: '2026-09-11T05:10:00.000Z', byName: null },
        },
      ],
    });

    const reminded = rowNudgeOf(row(), view);
    expect(reminded?.kind).toBe('sent');
    expect(reminded?.kind === 'sent' ? reminded.label : '').toMatch(
      /^Rappel envoyé le 11 septembre 2026 à \d{2}:\d{2} par Léa Martin$/u,
    );
    const warned = rowNudgeOf(row(NOT_READY), view);
    expect(warned?.kind === 'sent' ? warned.label : '').toMatch(/^Client averti le .+\d$/u);
  });

  it.each([
    ['la livraison', { method: 'delivery' }],
    ['un créneau pas encore dépassé', { state: 'ready' }],
    ['une commande retenue au contrôle qualité', { heldForQuality: true }],
  ] as const)('ne propose rien sur %s', (_case, over) => {
    expect(rowNudgeOf(row(over), nudges({ pickupReminderDelayMinutes: 0 }))).toBeNull();
  });

  it('sans lecture des relances, ne propose rien plutôt que de risquer un second envoi', () => {
    expect(rowNudgeOf(row(), null)).toBeNull();
  });
});
