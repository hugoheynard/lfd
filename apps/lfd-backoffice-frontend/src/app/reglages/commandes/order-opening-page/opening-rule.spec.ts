import type { OrderOpeningExemptionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { firstDayEffect, frenchDay, openingRule } from './opening-rule';

const TODAY = '2026-10-28';

const COMPANY: OrderOpeningExemptionView = {
  id: 'ex_1',
  kind: 'company',
  companyId: 'c1',
  label: 'Chez Paul',
  grantedAt: '2026-10-26T08:00:00.000Z',
  grantedBy: null,
};
const EMAIL: OrderOpeningExemptionView = {
  ...COMPANY,
  id: 'ex_2',
  kind: 'email',
  companyId: null,
  label: 'jean@folie.fr',
};

describe('frenchDay', () => {
  it('dit la journée en toutes lettres, sans fuseau', () => {
    expect(frenchDay('2026-11-27')).toBe('vendredi 27 novembre');
    expect(frenchDay('2026-10-28')).toBe('mercredi 28 octobre');
    expect(frenchDay('2027-01-01')).toBe('vendredi 1 janvier');
    expect(frenchDay('2028-02-29')).toBe('mardi 29 février');
  });
});

describe('openingRule', () => {
  const base = { open: true, firstDay: null, today: TODAY, exemptions: [] } as const;

  it('fermée sans exemption', () => {
    expect(openingRule({ ...base, audience: 'b2c', open: false })).toEqual({
      state: 'closed',
      sentence: 'Fermée : aucun particulier ne peut commander.',
    });
  });

  it('fermée aux pros, avec les sociétés et les adresses comptées', () => {
    expect(
      openingRule({ ...base, audience: 'b2b', open: false, exemptions: [COMPANY, EMAIL] }).sentence,
    ).toBe('Fermée : aucun pro ne peut commander, sauf 2 exemptions.');
  });

  it('fermée aux particuliers : une société n’y compte pas', () => {
    expect(
      openingRule({ ...base, audience: 'b2c', open: false, exemptions: [COMPANY, EMAIL] }).sentence,
    ).toBe('Fermée : aucun particulier ne peut commander, sauf 1 exemption.');
  });

  it('fermée avec une date future : la date s’appliquera à la réouverture', () => {
    expect(openingRule({ ...base, audience: 'b2c', open: false, firstDay: '2026-11-27' })).toEqual({
      state: 'closed',
      sentence:
        'Fermée : aucun particulier ne peut commander. À la réouverture, seuls les retraits et livraisons à partir du vendredi 27 novembre seront acceptés.',
    });
  });

  it('ouverte avec une date future', () => {
    expect(openingRule({ ...base, audience: 'b2c', firstDay: '2026-11-27' })).toEqual({
      state: 'from-date',
      sentence:
        'Ouverte : commandes dès maintenant, pour un retrait ou une livraison à partir du vendredi 27 novembre. Un jour antérieur est refusé, sauf exemption.',
    });
  });

  it('une date passée ou du jour ne restreint plus rien', () => {
    for (const firstDay of ['2026-10-01', TODAY]) {
      expect(openingRule({ ...base, audience: 'b2b', firstDay })).toEqual({
        state: 'open',
        sentence: 'Ouverte : les pros commandent pour n’importe quel jour servi.',
      });
    }
  });

  it('ouverte sans date', () => {
    expect(openingRule({ ...base, audience: 'b2c' }).sentence).toBe(
      'Ouverte : les particuliers commandent pour n’importe quel jour servi.',
    );
  });
});

describe('firstDayEffect', () => {
  it('dit la date posée', () => {
    expect(firstDayEffect('b2c', '2026-11-27', TODAY)).toBe(
      'Les particuliers pourront commander dès maintenant, mais seulement pour un retrait ou une livraison à partir du vendredi 27 novembre.',
    );
  });

  it('dit l’effacement', () => {
    expect(firstDayEffect('b2b', null, TODAY)).toBe(
      'Les pros pourront commander pour n’importe quel jour servi.',
    );
  });

  it('prévient qu’une date passée ne restreint rien', () => {
    expect(firstDayEffect('b2c', '2026-10-01', TODAY)).toBe(
      'Cette date est passée : elle ne restreindra rien.',
    );
  });
});
