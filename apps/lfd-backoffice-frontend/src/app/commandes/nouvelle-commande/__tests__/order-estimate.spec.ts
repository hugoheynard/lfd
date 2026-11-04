import type {
  AdminOrderEstimateAmountsView,
  AdminOrderEstimateView,
  AdminOrderEstimatePayload,
} from '@lfd/contracts';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PricedCartLine } from '../cart.store';
import { composedDraftOf, placePayloadOf, type DraftDecisions } from '../draft-payload';
import {
  ESTIMATE_DEBOUNCE_MS,
  estimatedLines,
  estimateKeyOf,
  estimatesOf,
  estimateRowsOf,
  estimateSummary,
  isBlockingRefusal,
  refusalViewOf,
  type EstimateRequest,
} from '../order-estimate';
import type { OrderDraft } from '../panier-commande/panier-commande';

const DRAFT: OrderDraft = {
  buyerUserId: 'u_1',
  fulfillmentMethod: 'pickup',
  pickupAddressId: 'pk_1',
  deliveryAddress: null,
  saveAddressToBook: false,
  requestedDeliveryDate: '2030-01-02',
  requestedWindow: null,
  note: '',
  settlement: 'account',
  immediate: false,
};

const LINES = [
  { sku: 'VIE-001', quantity: 2 },
  { sku: 'VIE-002', quantity: 5 },
];

function payload(overrides: Partial<OrderDraft> = {}, lines = LINES): AdminOrderEstimatePayload {
  return placePayloadOf('c_1', { ...DRAFT, ...overrides }, lines, 'commercial');
}

const AMOUNTS: AdminOrderEstimateAmountsView = {
  vatMethod: 'line_ht',
  lines: [
    {
      sku: 'VIE-001',
      productName: 'Croissant',
      quantity: 2,
      saleUnit: 'piece',
      vatRate: 5.5,
      unitPriceMillicents: 100_000,
      basePriceMillicents: 120_000,
      lineTotalCents: 200,
      lineTotalTtcCents: null,
    },
  ],
  subtotalCents: 1_000,
  discountCents: 50,
  discountTtcCents: null,
  discounts: [{ rank: 1, amountCents: 50, amountTtcCents: null, promotionId: null, label: null }],
  deliveryFeeCents: 0,
  deliveryFeeTtcCents: null,
  lateFeeCents: 300,
  lateFeeVatRatePercent: 20,
  vatCents: 112,
  vatShares: [
    { rate: 5.5, amountCents: 52 },
    { rate: 20, amountCents: 60 },
  ],
  totalCents: 1_362,
};

const VIEW: AdminOrderEstimateView = {
  amounts: AMOUNTS,
  cutoff: null,
  refusal: null,
  warnings: [],
};

describe('la clé d’estimation', () => {
  it('couvre tout le corps : le règlement, le jour, la note la changent', () => {
    const base = estimateKeyOf(payload());
    expect(estimateKeyOf(payload({ settlement: 'link' }))).not.toBe(base);
    expect(estimateKeyOf(payload({ requestedDeliveryDate: '2030-01-03' }))).not.toBe(base);
    expect(estimateKeyOf(payload({ note: 'sans sucre' }))).not.toBe(base);
    expect(estimateKeyOf(payload({}, [{ sku: 'VIE-001', quantity: 3 }]))).not.toBe(base);
  });

  it('ignore l’ordre des lignes', () => {
    expect(estimateKeyOf(payload({}, [...LINES].reverse()))).toBe(estimateKeyOf(payload()));
  });
});

describe('la complétude de la saisie', () => {
  const fulfillment = {
    method: 'pickup',
    pickupAddressId: 'pk_1',
    deliveryAddress: null,
    saveToBook: false,
    window: null,
    issue: null,
  } as const;
  const complete: DraftDecisions = {
    buyerUserId: 'u_1',
    fulfillment,
    requestedDate: '2030-01-02',
    note: '',
    settlement: 'account',
    immediate: false,
    empty: false,
  };

  it('compose quand tout y est', () => {
    expect(composedDraftOf(complete)).toMatchObject({ pickupAddressId: 'pk_1' });
  });

  it.each<[string, Partial<DraftDecisions>]>([
    ['panier vide', { empty: true }],
    ['sans interlocuteur', { buyerUserId: null }],
    ['sans jour', { requestedDate: '' }],
    ['acheminement non résolu', { fulfillment: null }],
    [
      'acheminement incomplet',
      { fulfillment: { ...fulfillment, issue: 'Choisissez un créneau.' } },
    ],
  ])('ne compose pas : %s', (_, override) => {
    expect(composedDraftOf({ ...complete, ...override })).toBeNull();
  });
});

describe('le corps de la passation', () => {
  it('porte l’origine comptoir, et seulement au comptoir (E4)', () => {
    expect(placePayloadOf('c_1', DRAFT, LINES, 'counter').entryOrigin).toBe('counter');
    expect('entryOrigin' in payload()).toBe(false);
  });
});

describe('le flux des estimations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function harness(): {
    requests: Subject<EstimateRequest | null>;
    calls: AdminOrderEstimatePayload[];
    responses: Subject<AdminOrderEstimateView>[];
    seen: (AdminOrderEstimateView | null)[];
    cancelled: () => number;
  } {
    const requests = new Subject<EstimateRequest | null>();
    const calls: AdminOrderEstimatePayload[] = [];
    const responses: Subject<AdminOrderEstimateView>[] = [];
    let cancelled = 0;
    const tracked = (body: AdminOrderEstimatePayload): Observable<AdminOrderEstimateView> => {
      calls.push(body);
      const response = new Subject<AdminOrderEstimateView>();
      responses.push(response);
      return new Observable<AdminOrderEstimateView>((subscriber) => {
        let settled = false;
        const sub = response.subscribe({
          next: (value) => {
            settled = true;
            subscriber.next(value);
          },
          error: (error: unknown) => {
            settled = true;
            subscriber.error(error);
          },
        });
        return () => {
          if (!settled) {
            cancelled += 1;
          }
          sub.unsubscribe();
        };
      });
    };
    const seen: (AdminOrderEstimateView | null)[] = [];
    estimatesOf(requests, tracked).subscribe((value) => seen.push(value));
    return { requests, calls, responses, seen, cancelled: () => cancelled };
  }

  const request = (body: AdminOrderEstimatePayload): EstimateRequest => ({
    key: estimateKeyOf(body),
    payload: body,
  });

  it('attend 400 ms sans changement, puis un seul appel', () => {
    const h = harness();
    h.requests.next(request(payload({ note: 'a' })));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS - 1);
    h.requests.next(request(payload({ note: 'ab' })));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS - 1);
    expect(h.calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(h.calls.map((c) => c.note)).toEqual(['ab']);
  });

  it('ne redemande rien quand la clé ne change pas', () => {
    const h = harness();
    h.requests.next(request(payload()));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    h.requests.next(request(payload({}, [...LINES].reverse())));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(1);
  });

  it('annule la requête en vol quand la saisie change, et garde l’ancienne valeur', () => {
    const h = harness();
    h.requests.next(request(payload()));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    h.responses[0]?.next(VIEW);
    h.requests.next(request(payload({ note: 'x' })));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    h.requests.next(request(payload({ note: 'y' })));
    expect(h.cancelled()).toBe(1);
    // Rien n'a été émis depuis la première réponse : pas de clignotement.
    expect(h.seen).toEqual([VIEW]);
  });

  it('retombe tout de suite à null quand la saisie redevient incomplète', () => {
    const h = harness();
    h.requests.next(request(payload()));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    h.responses[0]?.next(VIEW);
    h.requests.next(null);
    expect(h.seen).toEqual([VIEW, null]);
  });

  it('un échec rend null : pas de total faux', () => {
    const h = harness();
    h.requests.next(request(payload()));
    vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    h.responses[0]?.error(new Error('503'));
    expect(h.seen).toEqual([null]);
  });
});

describe('ce que le panier affiche de l’estimation', () => {
  const context = (settlement: 'account' | 'link') => ({
    settlement,
    method: 'pickup' as const,
    pickupAddressId: null,
    pickups: [],
  });

  it('au lien : la règle partagée rend la TVA et le TTC, supplément à part (D1)', () => {
    const rows = (estimateRowsOf(AMOUNTS, context('link')) ?? []).map((row) =>
      `${row.label} = ${row.value}`.replace(/\s/gu, ' '),
    );
    expect(rows).toEqual([
      'Sous-total HT = 10,00 €',
      'Remise retrait = − 0,50 €',
      'Surtaxe de retard HT = 3,00 €',
      'TVA = 1,12 €',
      'Total TTC = 13,62 €',
    ]);
  });

  it('au compte : le seul Total HT, ni TVA ni TTC (F5)', () => {
    const rows = estimateRowsOf(AMOUNTS, context('account')) ?? [];
    expect(rows.map((row) => row.label)).toEqual([
      'Sous-total HT',
      'Remise retrait',
      'Surtaxe de retard HT',
      'Total HT',
    ]);
    expect(rows.at(-1)?.value.replace(/\s/gu, ' ')).toBe('12,50 €');
  });

  it('sans estimation, rien', () => {
    expect(estimateRowsOf(null, context('link'))).toBeNull();
  });

  it('l’en-tête dit le total de la règle, le sous-total HT sans estimation', () => {
    const linked = estimateRowsOf(AMOUNTS, context('link'));
    const account = estimateRowsOf(AMOUNTS, context('account'));
    expect(estimateSummary(7, linked).replace(/\s/gu, ' ')).toBe('7 articles · Total TTC 13,62 €');
    expect(estimateSummary(7, account).replace(/\s/gu, ' ')).toBe('7 articles · Total HT 12,50 €');
    // Sans estimation, aucun montant : le panier n'en calcule pas (2026-11-04).
    expect(estimateSummary(1, null)).toBe('1 article · Prix à confirmer');
  });

  it('le prix barré vient de l’estimation quand il diffère', () => {
    const line: PricedCartLine = {
      sku: 'VIE-001',
      name: 'Croissant',
      unitPriceMillicents: 110_000,
      quantity: 2,
      canonicalPriceMillicents: null,
    };
    expect(estimatedLines([line], AMOUNTS)[0]).toMatchObject({
      unitPriceMillicents: 100_000,
      canonicalPriceMillicents: 120_000,
    });
    expect(estimatedLines([line], null)[0]).toBe(line);
  });

  it('un refus de grâce ne bloque pas (la dérogation passe par la validation)', () => {
    expect(isBlockingRefusal({ code: 'orders.cutoff.past', message: '' })).toBe(true);
    expect(isBlockingRefusal({ code: 'orders.cutoff.grace', message: '' })).toBe(false);
  });

  it('renvoie un refus vers la vue qui le corrige, quand on la connaît', () => {
    expect(refusalViewOf('orders.line.quantity_below_minimum')).toBe('lines');
    expect(refusalViewOf('orders.cutoff.past')).toBe('settings');
    expect(refusalViewOf('orders.inconnu')).toBeNull();
  });
});
