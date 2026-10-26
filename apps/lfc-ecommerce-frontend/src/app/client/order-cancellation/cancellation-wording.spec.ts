import { describe, expect, it } from 'vitest';

import { fill } from '../copy/client-copy.service';
import { orderCancelCopy } from '../copy/screens/order-cancel.copy';
import {
  moneySentence,
  outcomeSentence,
  parseGuestFragment,
  refusalOf,
  refusalSentence,
  untilLabel,
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
    expect(late).toContain('mercredi 14 octobre, 9 h');
    expect(late).not.toContain('{when}');
    expect(refusalSentence('too_late', null, 'fr', FR)).toBe(FR.tooLateUndated);
  });

  /** 2026-10-26 : « Annulable jusqu'au jeudi 31 octobre, 9 h », dans chaque langue. */
  it('dit l’échéance en toutes lettres, à l’heure de Paris, dans chaque langue', () => {
    // 08:00 UTC = 9 h à Paris (heure d'hiver, le 31 octobre 2030 est un jeudi).
    const sharp = '2030-10-31T08:00:00.000Z';
    expect(fill(FR.until, { when: untilLabel(sharp, 'fr', FR) })).toBe(
      'Annulable jusqu’au jeudi 31 octobre, 9 h.',
    );
    expect(untilLabel('2030-10-31T08:30:00.000Z', 'fr', FR)).toBe('jeudi 31 octobre, 9 h 30');
    const en = orderCancelCopy('en');
    expect(untilLabel(sharp, 'en', en)).toBe('Thursday, October 31, 9:00');
    const it_ = orderCancelCopy('it');
    expect(untilLabel(sharp, 'it', it_)).toBe('giovedì 31 ottobre, ore 9');
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
