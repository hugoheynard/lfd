import type { ShopItemFulfillmentOfferView } from '@lfd/contracts';

import { EN } from '../copy/en';
import { FR } from '../copy/fr';
import { offerMentionLabel } from './promotion-offers';

const TWENTY = { kind: 'percent', basisPoints: 2000 } as const;

const of = (offer: Partial<ShopItemFulfillmentOfferView>) =>
  offerMentionLabel({ effect: TWENTY, ...offer }, FR.product);

describe('offerMentionLabel — ce que la vignette dit', () => {
  it('dit le texte réglé tel que le serveur le sert', () => {
    expect(of({ text: '−20 % client Folie Coffee' })).toBe('−20 % client Folie Coffee');
  });

  it('sans texte, dit la valeur seule — jamais l’acheminement', () => {
    expect(of({})).toBe('−20 %');
    expect(of({ effect: { kind: 'amount', millicents: 500_000 } })).toBe('−5,00 €');
  });

  it('la valeur seule suit la langue de la boutique', () => {
    expect(offerMentionLabel({ effect: TWENTY }, EN.product, 'en')).toBe('−20%');
  });
});

describe('offerMentionLabel — une offre à jours et heures', () => {
  const FIFTY = { kind: 'percent', basisPoints: 5000 } as const;
  const hours = (activeNow: boolean, moment: 'ordered_at' | 'handover_at' = 'ordered_at') => ({
    moment,
    activeNow,
    windows: [{ weekdays: ['tue', 'thu'] as const, start: '17:00', end: '19:00' }],
  });

  it('hors des heures, se dit avec ses heures', () => {
    expect(of({ effect: FIFTY, hours: hours(false) })).toBe('−50 %, mardi et jeudi de 17 h à 19 h');
  });

  it('un texte réglé garde ses heures hors des heures', () => {
    expect(of({ text: 'Anti-gaspi', hours: hours(false) })).toBe(
      'Anti-gaspi, mardi et jeudi de 17 h à 19 h',
    );
  });

  it('active maintenant, se dit sans heures', () => {
    expect(of({ effect: FIFTY, hours: hours(true) })).toBe('−50 %');
  });

  it('jugée au créneau, dit le créneau ; tous les jours, les jours se taisent', () => {
    expect(
      of({
        effect: FIFTY,
        hours: {
          moment: 'handover_at',
          activeNow: false,
          windows: [
            {
              weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
              start: '20:30',
              end: '24:00',
            },
          ],
        },
      }),
    ).toBe('−50 %, pour un créneau de 20:30 à minuit');
  });
});
