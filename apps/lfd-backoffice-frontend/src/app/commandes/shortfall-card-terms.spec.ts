import { describe, expect, it } from 'vitest';

import { isShortfallCardRefusal, shortfallCardTermsOf } from './shortfall-card-terms';

/** La règle des termes du serveur (`termsRefusalOf`, plan E9 § 2.1), relue sur la fiche. */
describe('shortfallCardTermsOf', () => {
  it('une carte due refuse, hausse ou pas', () => {
    expect(shortfallCardTermsOf('due', false)).toBe('card_unpaid');
    expect(shortfallCardTermsOf('due', true)).toBe('card_unpaid');
  });

  it('une carte encaissée refuse sous une hausse vivante, sinon rembourse au solde', () => {
    expect(shortfallCardTermsOf('paid', true)).toBe('card_increase_pending');
    expect(shortfallCardTermsOf('paid', false)).toBe('refunded_at_settlement');
  });

  it.each(['account', 'free', null] as const)('%s ne parle pas de carte', (settlement) => {
    expect(shortfallCardTermsOf(settlement, true)).toBeNull();
  });

  it('seuls les deux refus empêchent le geste', () => {
    expect(isShortfallCardRefusal('card_unpaid')).toBe(true);
    expect(isShortfallCardRefusal('card_increase_pending')).toBe(true);
    expect(isShortfallCardRefusal('refunded_at_settlement')).toBe(false);
    expect(isShortfallCardRefusal(null)).toBe(false);
  });
});
