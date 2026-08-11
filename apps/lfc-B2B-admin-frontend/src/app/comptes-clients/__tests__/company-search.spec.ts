import { describe, expect, it } from 'vitest';

import type { AdminCompany } from '../admin-company';
import { matchesCompanySearch } from '../company-search';

function company(overrides: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id: 'c1',
    reference: 'C-000123',
    raisonSociale: 'Boulangerie Périn',
    enseigne: 'Le Fournil du Coin',
    formeJuridique: 'SARL',
    siret: '81234567800019',
    tvaIntracom: '',
    status: 'active',
    paymentTerm: 'per_order',
    requestedPaymentTerm: null,
    primaryContact: {
      id: null,
      firstName: 'Claire',
      lastName: 'Martin',
      fonction: '',
      email: 'claire@fournil.fr',
      phone: '',
    },
    owner: { firstName: 'Julien', lastName: 'Deschamps', email: 'julien@fournil.fr' },
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('matchesCompanySearch', () => {
  it('ne filtre rien sur une recherche vide', () => {
    expect(matchesCompanySearch(company(), '')).toBe(true);
    expect(matchesCompanySearch(company(), '   ')).toBe(true);
  });

  it('trouve par raison sociale et par enseigne', () => {
    // Les deux comptent : l'enseigne est le nom sous lequel le client se
    // présente au téléphone, la raison sociale celle des papiers.
    expect(matchesCompanySearch(company(), 'boulangerie')).toBe(true);
    expect(matchesCompanySearch(company(), 'fournil')).toBe(true);
  });

  it('ignore les accents dans les deux sens', () => {
    expect(matchesCompanySearch(company(), 'perin')).toBe(true);
    expect(matchesCompanySearch(company({ raisonSociale: 'Perin' }), 'périn')).toBe(true);
  });

  it('trouve par SIRET, espaces compris', () => {
    // Régression : un SIRET se dicte et se recopie par groupes ; comparer les
    // chaînes brutes ne trouvait jamais « 812 345 ».
    expect(matchesCompanySearch(company(), '812 345')).toBe(true);
    expect(matchesCompanySearch(company(), '81234567800019')).toBe(true);
  });

  it('trouve par le propriétaire de l’espace — nom ou e-mail', () => {
    expect(matchesCompanySearch(company(), 'deschamps')).toBe(true);
    expect(matchesCompanySearch(company(), 'julien@fournil')).toBe(true);
  });

  it('ne casse pas sur une société sans propriétaire', () => {
    const orphan = company({ owner: null });

    expect(matchesCompanySearch(orphan, 'deschamps')).toBe(false);
    expect(matchesCompanySearch(orphan, 'boulangerie')).toBe(true);
  });

  it('rejette ce qui ne correspond à aucun des champs cherchés', () => {
    // Le contact principal n'est PAS cherché : c'est le propriétaire de l'espace
    // qui l'est. Si ça doit changer, ce test doit tomber d'abord.
    expect(matchesCompanySearch(company(), 'martin')).toBe(false);
    expect(matchesCompanySearch(company(), 'pâtisserie')).toBe(false);
  });
});
