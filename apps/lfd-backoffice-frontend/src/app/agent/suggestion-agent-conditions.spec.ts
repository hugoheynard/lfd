import { NO_STAFF_SUGGESTION_CONDITIONS } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../suggestions/staff-suggestion.testing';

import { conditionsOf } from './suggestion-agent-conditions';

describe('conditionsOf', () => {
  const posed = staffSuggestion({
    conditions: {
      weekdays: ['mon'],
      hours: { from: '07:00', to: '11:00' },
      minCartTotalCents: 2_000,
      cartWithoutFamilyId: 'fam-boissons',
      pickupAddressIds: ['site-centre'],
    },
  });

  it('à la création, rien de donné : aucune condition', () => {
    expect(conditionsOf({}, null)).toEqual(NO_STAFF_SUGGESTION_CONDITIONS);
  });

  it('un champ OMIS garde la valeur de la règle', () => {
    expect(conditionsOf({ hoursTo: '12:00' }, posed)).toEqual({
      ...posed.conditions,
      hours: { from: '07:00', to: '12:00' },
    });
  });

  it('un champ VIDE retire la condition', () => {
    expect(
      conditionsOf(
        {
          weekdays: [],
          hoursFrom: '',
          hoursTo: '',
          minCartTotalCents: 0,
          cartWithoutFamilyId: '',
          pickupAddressIds: [],
        },
        posed,
      ),
    ).toEqual(NO_STAFF_SUGGESTION_CONDITIONS);
  });
});
