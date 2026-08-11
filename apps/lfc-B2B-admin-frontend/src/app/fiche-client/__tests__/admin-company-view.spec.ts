import { describe, expect, it } from 'vitest';

import type { AdminCompany, CompanyStatus } from '../../comptes-clients/admin-company';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
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
    owner: null,
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

  /** Une fiche détail à partir de la société de liste — contacts additionnels au choix. */
  function detail(contacts: AdminCompanyDetail['contacts'] = []): AdminCompanyDetail {
    return {
      ...company(),
      vatNumberRequired: false,
      addresses: { billing: null, deliveries: [] },
      contacts,
    };
  }

  it('nomme le contact principal par son rôle réel : détenteur du compte', () => {
    // « Contact principal » et « détenteur » désignaient la même personne sous
    // deux noms ; celui qu'on rappelle est celui qui se connecte.
    const cards = toContactCards(detail());

    expect(cards).toHaveLength(1);
    expect(cards[0]?.isPrimary).toBe(true);
    expect(cards[0]?.role).toBe('Détenteur du compte');
  });

  it('ne badge JAMAIS « Vous » côté staff', () => {
    // Le staff n'est pas un interlocuteur de la société : la pastille n'a de
    // sens que côté client, où elle distingue le lecteur des autres.
    expect(toContactCards(detail())[0]?.isYou).toBe(false);
  });

  it('ajoute les interlocuteurs additionnels après le détenteur', () => {
    const cards = toContactCards(
      detail([
        {
          id: 'ct_1',
          firstName: 'Léa',
          lastName: 'Martin',
          fonction: 'Réception',
          email: 'lea@exemple.fr',
          phone: '',
        },
      ]),
    );

    expect(cards).toHaveLength(2);
    expect(cards[1]?.isPrimary).toBe(false);
    // La fonction sert de rôle quand elle est là — c'est ce qui distingue deux
    // interlocuteurs d'une même société.
    expect(cards[1]?.role).toBe('Réception');
  });
});
