import { HttpErrorResponse } from '@angular/common/http';
import type { OrderQuoteCutoffView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  ITEM_LIMIT_CLOSED,
  exceededSummaryOf,
  isItemLimitReasonRefusal,
  itemLimitBlockerOf,
  itemLimitReasonBlockerOf,
  itemLimitNoticesOf,
  itemLimitReasonPayloadOf,
} from '../item-limits';

const LIMIT = { sku: 'PAIN', daysBefore: 1, time: '18:00', limitAt: '2030-01-01T17:00:00.000Z' };

function cutoff(patch: Partial<OrderQuoteCutoffView>): OrderQuoteCutoffView {
  return { status: 'open', until: null, exceeded: [], closedByItemLimit: [], ...patch };
}

describe('itemLimitNoticesOf', () => {
  it('une limite que la saisie passerait demande le motif', () => {
    const notices = itemLimitNoticesOf(
      cutoff({ exceeded: [LIMIT], closedByItemLimit: [{ sku: 'PAIN', exceedable: true }] }),
    );
    expect(notices.get('PAIN')).toEqual({
      kind: 'exceeded',
      text: 'Limite dépassée — ce produit se commande 1 jour avant, 18:00.',
    });
  });

  it('« dépassable » sous un jour fermé ne se commande plus : l’écran lit le statut', () => {
    const notices = itemLimitNoticesOf(
      cutoff({
        status: 'closed',
        exceeded: [LIMIT],
        closedByItemLimit: [{ sku: 'PAIN', exceedable: true }],
      }),
    );
    expect(notices.get('PAIN')).toEqual({ kind: 'closed', text: ITEM_LIMIT_CLOSED });
  });

  it('non dépassable : ne se commande plus', () => {
    const notices = itemLimitNoticesOf(
      cutoff({ closedByItemLimit: [{ sku: 'PAIN', exceedable: false }] }),
    );
    expect(notices.get('PAIN')?.kind).toBe('closed');
  });

  it('sans avis, rien', () => {
    expect(itemLimitNoticesOf(null).size).toBe(0);
  });
});

describe('itemLimitBlockerOf', () => {
  const asked = cutoff({ exceeded: [LIMIT] });

  it('rien quand aucune limite n’est passée', () => {
    expect(itemLimitBlockerOf(cutoff({}), false, '')).toBeNull();
  });

  it('demande le geste, puis le motif, puis un motif court', () => {
    expect(itemLimitBlockerOf(asked, false, '')).toContain('passez outre');
    expect(itemLimitBlockerOf(asked, true, '   ')).toContain('Indiquez pourquoi');
    expect(itemLimitBlockerOf(asked, true, 'x'.repeat(281))).toContain('280');
    expect(itemLimitBlockerOf(asked, true, 'Client fidèle')).toBeNull();
  });
});

describe('itemLimitReasonPayloadOf', () => {
  it('le motif nettoyé, ou rien', () => {
    expect(itemLimitReasonPayloadOf(true, '  motif ')).toEqual({
      itemLimitOverrideReason: 'motif',
    });
    expect(itemLimitReasonPayloadOf(true, '  ')).toEqual({});
    expect(itemLimitReasonPayloadOf(false, 'motif')).toEqual({});
  });
});

describe('isItemLimitReasonRefusal', () => {
  it('lit le code, pas la phrase', () => {
    const refusal = (code: string) =>
      new HttpErrorResponse({ status: 409, error: { code, message: 'Indiquez pourquoi.' } });
    expect(isItemLimitReasonRefusal(refusal('orders.cutoff.item_limit_reason_required'))).toBe(
      true,
    );
    expect(isItemLimitReasonRefusal(refusal('orders.cutoff.grace'))).toBe(false);
  });
});

describe('itemLimitReasonBlockerOf', () => {
  it('ne retient rien sans limite passée, le motif sinon', () => {
    expect(itemLimitReasonBlockerOf(false, false, '')).toBeNull();
    expect(itemLimitReasonBlockerOf(true, false, '')).toContain('passez outre');
    expect(itemLimitReasonBlockerOf(true, true, ' ')).toContain('Indiquez pourquoi');
    expect(itemLimitReasonBlockerOf(true, true, 'Client fidèle')).toBeNull();
  });
});

describe('exceededSummaryOf — le résumé en tête du panier', () => {
  it('aucune ligne : rien à dire', () => {
    expect(exceededSummaryOf([], '2030-01-02')).toBeNull();
  });

  it('plusieurs produits : les nomme tous, avec le jour', () => {
    expect(exceededSummaryOf([{ name: 'Croissant' }, { name: 'Pain au maïs' }], '2030-01-02')).toBe(
      'Des produits ont dépassé leur limite de commande pour le mercredi 2 janvier : Croissant, Pain au maïs.',
    );
  });

  it('un seul produit, jour pas encore choisi : au singulier, sans jour', () => {
    expect(exceededSummaryOf([{ name: 'Croissant' }], '')).toBe(
      'Un produit a dépassé sa limite de commande : Croissant.',
    );
  });
});
