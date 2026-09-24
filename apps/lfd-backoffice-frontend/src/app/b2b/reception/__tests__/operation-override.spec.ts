import type { ReceivedOperationView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  overrideDraftOf,
  readOverride,
  sameDraft,
  type OverrideDraft,
} from '../operation-override';
import { receivedOperation } from '../received-operation.testing';

// Les dates sont le SUJET de ces cas et ne sont comparées qu'entre elles —
// jamais à l'horloge (CLAUDE.md §5, l'exception étroite).
const EMPTY: OverrideDraft = {
  isHidden: false,
  orderUntilDay: '',
  orderUntilTime: '',
  audience: null,
  hiddenSkus: [],
};

const SELECTION = ['BUCHE-4', 'BUCHE-8', 'GALETTE-1'];

function received(override: ReceivedOperationView['override']): ReceivedOperationView {
  return receivedOperation({ skus: SELECTION, override });
}

describe('readOverride — la clôture en heure de Paris', () => {
  it('rien de saisi : on garde ce qui est reçu', () => {
    expect(readOverride(EMPTY, SELECTION)).toEqual({
      ok: true,
      payload: { isHidden: false, orderUntil: null, audience: null, hiddenSkus: [] },
    });
  });

  it('midi à Paris en hiver est 11 h UTC', () => {
    const reading = readOverride(
      { ...EMPTY, orderUntilDay: '2026-12-20', orderUntilTime: '12:00' },
      SELECTION,
    );
    expect(reading.ok && reading.payload.orderUntil).toBe('2026-12-20T11:00:00.000Z');
  });

  it('midi à Paris en été est 10 h UTC', () => {
    const reading = readOverride(
      { ...EMPTY, orderUntilDay: '2027-06-20', orderUntilTime: '12:00' },
      SELECTION,
    );
    expect(reading.ok && reading.payload.orderUntil).toBe('2027-06-20T10:00:00.000Z');
  });

  it('refuse une heure qui n’existe pas (passage à l’heure d’été)', () => {
    const reading = readOverride(
      { ...EMPTY, orderUntilDay: '2027-03-28', orderUntilTime: '02:30' },
      SELECTION,
    );
    expect(reading.ok).toBe(false);
  });

  it('un jour sans heure dit ce qui manque', () => {
    const reading = readOverride({ ...EMPTY, orderUntilDay: '2026-12-20' }, SELECTION);
    expect(reading).toEqual({
      ok: false,
      problem: 'Pour fermer la commande plus tôt, renseignez le jour ET l’heure.',
    });
  });

  it('range les articles retirés dans l’ordre du rayon, et garde ceux qu’il ne porte plus', () => {
    const reading = readOverride(
      { ...EMPTY, hiddenSkus: ['DISPARU-1', 'GALETTE-1', 'BUCHE-4'] },
      SELECTION,
    );
    expect(reading.ok && reading.payload.hiddenSkus).toEqual(['BUCHE-4', 'GALETTE-1', 'DISPARU-1']);
  });
});

describe('overrideDraftOf', () => {
  it('sans surcharge, la saisie est vide', () => {
    expect(overrideDraftOf(received(null))).toEqual(EMPTY);
  });

  it('relit la clôture posée en heure de Paris, et rend l’instant d’origine', () => {
    const draft = overrideDraftOf(
      received({
        isHidden: true,
        orderUntil: '2026-12-20T11:00:00.000Z',
        audience: 'pro',
        hiddenSkus: ['BUCHE-8'],
        decidedBy: 'staff_1',
        decidedAt: '2026-11-02T09:00:00.000Z',
      }),
    );
    expect(draft).toEqual({
      isHidden: true,
      orderUntilDay: '2026-12-20',
      orderUntilTime: '12:00',
      audience: 'pro',
      hiddenSkus: ['BUCHE-8'],
    });
    const back = readOverride(draft, SELECTION);
    expect(back.ok && back.payload.orderUntil).toBe('2026-12-20T11:00:00.000Z');
  });
});

describe('sameDraft', () => {
  it('l’ordre des articles retirés n’est pas une modification', () => {
    expect(
      sameDraft({ ...EMPTY, hiddenSkus: ['A', 'B'] }, { ...EMPTY, hiddenSkus: ['B', 'A'] }),
    ).toBe(true);
    expect(sameDraft(EMPTY, { ...EMPTY, isHidden: true })).toBe(false);
  });
});
