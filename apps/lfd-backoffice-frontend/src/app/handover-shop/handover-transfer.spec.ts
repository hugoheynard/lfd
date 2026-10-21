import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, OrderTransferView } from '@lfd/contracts';

import {
  reasonRequired,
  receivable,
  transferBlockReason,
  transferSummary,
  transfersOf,
} from './handover-transfer';

/**
 * Le transfert vu du comptoir : une commande d'un site servi par transfert ne
 * se remet qu'une fois le transfert reçu, et la bande « Réceptionner » montre
 * un transfert par carte (plan du transfert interne, §6).
 */

function transfer(over: Partial<OrderTransferView> = {}): OrderTransferView {
  return {
    transferId: 'tr_1',
    siteLabel: 'Val Village',
    state: 'departed',
    at: '2026-09-10T05:12:00.000Z',
    binCount: 3,
    ...over,
  };
}

function entry(over: Partial<HandoverQueueEntryView> = {}): HandoverQueueEntryView {
  return {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    tradeName: null,
    pickupLabel: 'Val Village',
    fulfillmentMethod: 'pickup',
    window: null,
    totalUnits: 12,
    placedAt: '2026-09-10T05:00:00.000Z',
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    heldForQuality: false,
    clientele: 'pro',
    ...over,
  };
}

describe('transferBlockReason', () => {
  it('ne dit rien sans transfert, ni sur un transfert reçu', () => {
    expect(transferBlockReason(entry())).toBeNull();
    expect(transferBlockReason(entry({ transfer: null }))).toBeNull();
    expect(transferBlockReason(entry({ transfer: transfer({ state: 'received' }) }))).toBeNull();
  });

  it('refuse prévu, parti et pas encore composé, en nommant le site', () => {
    for (const state of ['planned', 'departed', 'awaiting'] as const) {
      const why = transferBlockReason(
        entry({ transfer: transfer({ state, transferId: state === 'awaiting' ? null : 'tr_1' }) }),
      );
      expect(why).toContain('Val Village');
    }
  });

  it('se tait sur une commande déjà retirée ou annulée', () => {
    const t = transfer({ state: 'planned' });
    expect(transferBlockReason(entry({ state: 'handed_over', transfer: t }))).toBeNull();
    expect(transferBlockReason(entry({ state: 'cancelled', transfer: t }))).toBeNull();
  });
});

describe('transfersOf', () => {
  it('un transfert par carte, compte ses commandes, le moins avancé en tête', () => {
    const rows = [
      entry({ orderId: 'a', transfer: transfer({ transferId: 'tr_1', state: 'received' }) }),
      entry({ orderId: 'b', transfer: transfer({ transferId: 'tr_1', state: 'received' }) }),
      entry({ orderId: 'c', transfer: transfer({ transferId: 'tr_2', state: 'planned' }) }),
      entry({ orderId: 'd' }),
    ];
    const cards = transfersOf(rows);
    expect(cards.map((c) => [c.key, c.orderCount, c.transferId])).toEqual([
      ['tr_2', 1, 'tr_2'],
      ['tr_1', 2, 'tr_1'],
    ]);
  });

  /** Régression (R3c, R3e) : un transfert de réassort seul n'avait aucune carte au comptoir. */
  it('ajoute un transfert de réassort seul, réceptionnable, compté en réassorts', () => {
    const cards = transfersOf(
      [entry({ orderId: 'a', transfer: transfer({ transferId: 'tr_1', state: 'received' }) })],
      [
        {
          transferId: 'tr_rs',
          siteId: 'site_vv',
          siteLabel: 'Val Village',
          state: 'departed',
          at: '2026-09-10T05:12:00.000Z',
          binCount: 1,
          resupplyCount: 2,
        },
      ],
    );
    const [resupply] = cards;
    expect(cards.map((c) => c.key)).toEqual(['tr_rs', 'tr_1']);
    expect(resupply && receivable(resupply)).toBe(true);
    expect(resupply && transferSummary(resupply)).toMatch(/^1 bac · 2 réassorts · parti à /u);
  });

  it('regroupe les commandes pas encore composées par site', () => {
    const awaiting = transfer({ transferId: null, state: 'awaiting', at: null, binCount: 0 });
    const cards = transfersOf([
      entry({ orderId: 'a', transfer: awaiting }),
      entry({ orderId: 'b', transfer: awaiting }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.key).toBe('awaiting:Val Village');
    expect(cards[0] !== undefined && receivable(cards[0])).toBe(false);
  });
});

describe('réception', () => {
  const [planned] = transfersOf([entry({ transfer: transfer({ state: 'planned' }) })]);
  const [departed] = transfersOf([entry({ transfer: transfer({ state: 'departed' }) })]);
  const [received] = transfersOf([entry({ transfer: transfer({ state: 'received' }) })]);

  it('se réceptionne prévu (motif obligatoire) ou parti (motif facultatif), jamais reçu', () => {
    expect(planned && receivable(planned) && reasonRequired(planned)).toBe(true);
    expect(departed && receivable(departed)).toBe(true);
    expect(departed && reasonRequired(departed)).toBe(false);
    expect(received && receivable(received)).toBe(false);
  });

  it('résume bacs et commandes, au singulier comme au pluriel', () => {
    expect(planned && transferSummary({ ...planned, binCount: 1 })).toBe('1 bac · 1 commande');
    expect(departed && transferSummary(departed)).toMatch(/^3 bacs · 1 commande · parti à /u);
  });
});
