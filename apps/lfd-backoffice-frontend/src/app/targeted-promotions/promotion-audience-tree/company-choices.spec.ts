import { describe, expect, it } from 'vitest';

import type { AdminCompany } from '../../comptes-clients/admin-company';
import { companyChoicesOf } from './company-choices';

function company(overrides: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id: 'c1',
    reference: 'C-000123',
    raisonSociale: 'Boulangerie Périn',
    enseigne: 'Le Fournil du Coin',
    formeJuridique: 'SARL',
    siret: '81234567800019',
    siren: '',
    vatNumber: '',
    status: 'active',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      // L'API renvoie le rôle du contact ; la fixture le portait pas.
      role: null,
      firstName: 'Claire',
      lastName: 'Martin',
      fonction: '',
      email: 'claire@fournil.fr',
      phone: '',
    },
    owner: { firstName: 'Julien', lastName: 'Deschamps', email: 'julien@fournil.fr' },
    kbis: null,
    hasOpenSupportRequest: false,
    parent: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    declaredVia: null,
    piecesReached: [],
    archivedAt: null,
    activatedAt: null,
    warnings: [],
    ...overrides,
  };
}

describe('companyChoicesOf', () => {
  const fournil = company({ id: 'c1' });
  const alpes = company({
    id: 'c2',
    reference: 'C-000456',
    raisonSociale: 'Hôtels des Alpes SAS',
    enseigne: '',
    siret: '90000000000011',
    owner: null,
  });

  it('nomme par l’enseigne, sinon la raison sociale, avec la référence, et trie', () => {
    expect(companyChoicesOf([fournil, alpes]).options).toEqual([
      { value: 'c2', label: 'Hôtels des Alpes SAS · C-000456' },
      { value: 'c1', label: 'Le Fournil du Coin · C-000123' },
    ]);
  });

  it('retrouve par enseigne, raison sociale, référence ou SIRET dicté', () => {
    const { options, filter } = companyChoicesOf([fournil, alpes]);
    const found = (term: string): string[] =>
      options.filter((option) => filter(option, term)).map((option) => option.value);
    expect(found('fournil')).toEqual(['c1']);
    expect(found('perin')).toEqual(['c1']);
    expect(found('C-000456')).toEqual(['c2']);
    expect(found('900 000')).toEqual(['c2']);
  });

  it('une option inconnue de la liste ne passe pas le filtre', () => {
    const { filter } = companyChoicesOf([fournil]);
    expect(filter({ value: 'ailleurs', label: 'Ailleurs' }, 'a')).toBe(false);
  });

  it('les sites d’une société sont ses sous-comptes, nommés et triés', () => {
    const chalet = company({
      id: 'c3',
      enseigne: 'Chalet Blanc',
      reference: 'C-000789',
      parent: { id: 'c2', enseigne: '' },
    });
    const { sitesOf } = companyChoicesOf([fournil, alpes, chalet]);
    expect(sitesOf('c2')).toEqual(['Chalet Blanc · C-000789']);
    expect(sitesOf('c1')).toEqual([]);
  });
});
