import { describe, expect, it } from 'vitest';

import { orderCancelCopy } from '../copy/screens/order-cancel.copy';
import {
  moneySentence,
  outcomeSentence,
  parseGuestFragment,
  refusalOf,
  refusalSentence,
} from './cancellation-wording';

const FR = orderCancelCopy('fr');

describe('cancellation-wording', () => {
  it('dit ce qui arrivera à l’argent, selon le régime', () => {
    const base = { cancellable: true, until: null, voucherReturned: false } as const;
    expect(moneySentence({ ...base, money: { kind: 'nothing_charged' } }, FR)).toBe(
      FR.moneyNothing,
    );
    expect(moneySentence({ ...base, money: { kind: 'account' } }, FR)).toBe(FR.moneyAccount);
    expect(moneySentence({ ...base, money: { kind: 'refund', amountCents: 1250 } }, FR)).toContain(
      '12,50',
    );
  });

  it('date le « trop tard » à Paris, et perd la date plutôt que d’afficher un jeton', () => {
    const late = refusalSentence('too_late', '2026-10-14T07:00:00.000Z', 'fr', FR);
    expect(late).toContain('14/10');
    expect(late).toContain('09:00');
    expect(late).not.toContain('{when}');
    expect(refusalSentence('too_late', null, 'fr', FR)).toBe(FR.tooLateUndated);
  });

  it('lit le code d’un 409, et ignore un code étranger', () => {
    expect(refusalOf('orders.customer_cancel.in_preparation', FR)).toBe('in_preparation');
    expect(refusalOf('orders.customer_cancel.toString', FR)).toBeNull();
    expect(refusalOf('order.cutoff.passed', FR)).toBeNull();
    expect(refusalOf(null, FR)).toBeNull();
  });

  it('dit le refus par son code, sinon par la phrase du serveur, sinon le repli', () => {
    const said = (errorCode: string | null, message: string): string =>
      outcomeSentence({ kind: 'refused', errorCode, message }, null, 'fr', FR);
    expect(said('orders.customer_cancel.invoiced', 'x')).toBe(FR.refusals.invoiced);
    expect(said('orders.other', 'Phrase du serveur')).toBe('Phrase du serveur');
    expect(said(null, '')).toBe(FR.refusedFallback);
  });

  it('lit le fragment `#<orderId>.<jeton>`, et rien d’autre', () => {
    expect(parseGuestFragment('01JORDER.abc-_DEF')).toEqual({
      orderId: '01JORDER',
      token: 'abc-_DEF',
    });
    expect(parseGuestFragment('#01JORDER.tok')).toEqual({ orderId: '01JORDER', token: 'tok' });
    expect(parseGuestFragment(null)).toBeNull();
    expect(parseGuestFragment('')).toBeNull();
    expect(parseGuestFragment('sans-point')).toBeNull();
    expect(parseGuestFragment('.tok')).toBeNull();
    expect(parseGuestFragment('id.')).toBeNull();
  });
});
