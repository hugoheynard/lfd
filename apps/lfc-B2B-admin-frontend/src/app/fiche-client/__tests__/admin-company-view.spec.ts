import { describe, expect, it } from 'vitest';

import type { AdminCompany, CompanyStatus } from '../../comptes-clients/admin-company';
import { toContactCards, toIdentityView } from '../admin-company-view';

function company(over: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id: 'c1',
    reference: 'C-ADM001',
    raisonSociale: 'Café des Halles SAS',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '81245678900021',
    tvaIntracom: '',
    status: 'pending',
    paymentTerm: 'per_order',
    requestedPaymentTerm: null,
    primaryContact: {
      id: null,
      firstName: 'Camille',
      lastName: 'Rousseau',
      fonction: 'Gérante',
      email: 'gerant@halles.fr',
      phone: '',
    },
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    ...over,
  };
}

describe('admin-company-view', () => {
  it('mappe l’identité sans rôle (le staff n’est pas membre) ni alerte TVA', () => {
    const view = toIdentityView(company({ tvaIntracom: '' }));
    expect(view.roleLabel).toBeNull();
    expect(view.tvaMissing).toBe(false);
  });

  it('mappe le ton du statut, `terminated` inclus', () => {
    const tone = (status: CompanyStatus): string => toIdentityView(company({ status })).statusTone;
    expect(tone('active')).toBe('success');
    expect(tone('pending')).toBe('warning');
    expect(tone('suspended')).toBe('alert');
    expect(tone('terminated')).toBe('neutral');
  });

  it('ne produit que le contact principal, en lecture seule (pas « Vous »)', () => {
    const cards = toContactCards(company());
    expect(cards).toHaveLength(1);
    expect(cards[0]?.isPrimary).toBe(true);
    expect(cards[0]?.isYou).toBe(false);
    expect(cards[0]?.role).toBe('Contact principal');
  });
});
