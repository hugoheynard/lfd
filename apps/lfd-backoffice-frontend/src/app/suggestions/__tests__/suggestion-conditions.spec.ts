import { NO_STAFF_SUGGESTION_CONDITIONS } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  conditionsDraftOf,
  conditionsMissing,
  conditionsParts,
  conditionsPayloadOf,
  EMPTY_CONDITIONS,
  eurosText,
  weekdaysText,
} from '../suggestion-conditions';

const CHOICES = {
  articles: [],
  families: [{ id: 'fam-boissons', name: 'Boissons' }],
  sites: [
    { id: 'site-centre', label: 'Centre' },
    { id: 'site-gare', label: 'Gare' },
  ],
};

describe('conditionsPayloadOf', () => {
  it('sans rien saisi : aucune condition', () => {
    expect(conditionsPayloadOf(EMPTY_CONDITIONS, 'cart')).toEqual(NO_STAFF_SUGGESTION_CONDITIONS);
  });

  it('les champs deviennent le contrat — le montant en centimes entiers', () => {
    const draft = {
      weekdays: ['mon', 'fri'] as const,
      hoursFrom: '07:00',
      hoursTo: '11:00',
      minCartEuros: '20,50',
      cartWithoutFamilyId: 'fam-boissons',
      pickupAddressIds: ['site-centre'],
    };
    expect(conditionsPayloadOf(draft, 'cart')).toEqual({
      weekdays: ['mon', 'fri'],
      hours: { from: '07:00', to: '11:00' },
      minCartTotalCents: 2_050,
      cartWithoutFamilyId: 'fam-boissons',
      pickupAddressIds: ['site-centre'],
    });
  });

  it('hors du panier, le montant et la famille ne partent pas', () => {
    const draft = { ...EMPTY_CONDITIONS, minCartEuros: '20', cartWithoutFamilyId: 'fam-boissons' };
    expect(conditionsPayloadOf(draft, 'home')).toEqual(NO_STAFF_SUGGESTION_CONDITIONS);
  });

  it('se relit telle quelle depuis une règle', () => {
    const conditions = {
      weekdays: ['sat' as const],
      hours: { from: '08:00', to: '12:00' },
      minCartTotalCents: 2_000,
      cartWithoutFamilyId: null,
      pickupAddressIds: null,
    };
    expect(conditionsPayloadOf(conditionsDraftOf(conditions), 'cart')).toEqual(conditions);
  });
});

describe('conditionsMissing', () => {
  it('une plage à moitié, un montant illisible ; rien à redire sinon', () => {
    expect(conditionsMissing({ ...EMPTY_CONDITIONS, hoursFrom: '07:00' }, 'cart')).toContain(
      'plage horaire',
    );
    expect(conditionsMissing({ ...EMPTY_CONDITIONS, minCartEuros: 'vingt' }, 'cart')).toContain(
      'montant minimum',
    );
    expect(conditionsMissing({ ...EMPTY_CONDITIONS, minCartEuros: 'vingt' }, 'home')).toBeNull();
    expect(conditionsMissing(EMPTY_CONDITIONS, 'cart')).toBeNull();
  });
});

describe('les mots des conditions', () => {
  it('les jours : une suite, un seul, des jours épars', () => {
    expect(weekdaysText(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('du lundi au vendredi');
    expect(weekdaysText(['sat'])).toBe('le samedi');
    expect(weekdaysText(['mon', 'thu'])).toBe('le lundi et le jeudi');
    expect(weekdaysText(['sat', 'sun'])).toBe('le samedi et le dimanche');
  });

  it('les euros sans décimale inutile', () => {
    expect(eurosText(2_000)).toBe('20 €');
    expect(eurosText(1_250)).toBe('12,50 €');
    expect(eurosText(5)).toBe('0,05 €');
  });

  it('la phrase entière, dans l’ordre où l’on parle', () => {
    expect(
      conditionsParts(
        {
          weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          hours: { from: '07:00', to: '11:30' },
          minCartTotalCents: 2_000,
          cartWithoutFamilyId: 'fam-boissons',
          pickupAddressIds: ['site-centre', 'site-gare'],
        },
        CHOICES,
      ),
    ).toEqual([
      'du lundi au vendredi',
      'de 7 h à 11 h 30',
      'si le panier atteint 20 €',
      'si le panier n’a aucun article de la famille Boissons',
      'en retrait à Centre ou Gare',
    ]);
    expect(conditionsParts(NO_STAFF_SUGGESTION_CONDITIONS, CHOICES)).toEqual([]);
  });
});
