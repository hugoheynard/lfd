import type { CompanyContactView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { CompanyStatus } from '../../comptes-clients/admin-company';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { toContactCards, toIdentityView } from '../admin-company-view';

function company(over: Partial<AdminCompanyDetail> = {}): AdminCompanyDetail {
  return {
    activation: null,
    gate: { canActivate: false, blocking: [], checklist: [] },
    suspensionCause: null,
    id: 'c1',
    reference: 'C-ADM001',
    raisonSociale: 'Café des Halles SAS',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '81245678900021',
    vatNumber: '',
    status: 'pending',
    grantedTerms: [],
    requestedTerm: null,
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
    warnings: [],
    // Le DÉTAIL : c'est lui que la fiche projette, et lui seul qui sait si la
    // forme juridique impose un numéro de TVA.
    vatNumberRequired: true,
    addresses: { billing: null, deliveries: [] },
    contacts: [],
    fulfillmentPreference: { method: null, pickupAddressId: null, deliveryAddressId: null },
    ...over,
  };
}

describe('admin-company-view', () => {
  it('mappe l’identité sans rôle — le staff n’est pas membre', () => {
    expect(toIdentityView(company()).roleLabel).toBeNull();
  });

  it('SIGNALE la TVA manquante quand la forme juridique l’impose', () => {
    // La fiche réclamait le SIRET dans un bandeau et se taisait sur la TVA :
    // deux pièces d'activation, une seule annoncée.
    expect(toIdentityView(company({ vatNumber: '' })).vatMissing).toBe(true);
  });

  it('ne dit RIEN quand la forme n’y est pas assujettie', () => {
    expect(toIdentityView(company({ vatNumber: '', vatNumberRequired: false })).vatMissing).toBe(
      false,
    );
  });

  it('ne dit rien non plus quand le numéro est là', () => {
    expect(toIdentityView(company({ vatNumber: 'FR12345678901' })).vatMissing).toBe(false);
  });

  it('mappe le ton du statut, `terminated` inclus', () => {
    const tone = (status: CompanyStatus): string => toIdentityView(company({ status })).statusTone;
    expect(tone('active')).toBe('success');
    expect(tone('pending')).toBe('warning');
    expect(tone('suspended')).toBe('alert');
    expect(tone('terminated')).toBe('neutral');
  });

  /**
   * Une fiche détail — la liste d'interlocuteurs porte le **détenteur** en tête
   * (le serveur la projette ainsi), puis le carnet.
   */
  const HOLDER: CompanyContactView = {
    contactId: null,
    firstName: 'Camille',
    lastName: 'Rousseau',
    fonction: 'Gérante',
    email: 'gerant@halles.fr',
    phone: '',
    role: 'owner',
    access: 'none',
    emailVerified: false,
  };

  function detail(book: readonly CompanyContactView[] = []): AdminCompanyDetail {
    return {
      ...company(),
      vatNumberRequired: false,
      addresses: { billing: null, deliveries: [] },
      contacts: [HOLDER, ...book],
      fulfillmentPreference: { method: null, pickupAddressId: null, deliveryAddressId: null },
    };
  }

  it('nomme le détenteur par son rôle réel', () => {
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

  it("porte l'état d'accès de chaque interlocuteur", () => {
    // L'accès n'est pas une seconde liste : c'est un état de la personne.
    const cards = toContactCards(
      detail([
        {
          contactId: 'ct_1',
          firstName: 'Léa',
          lastName: 'Martin',
          fonction: 'Réception',
          email: 'lea@exemple.fr',
          phone: '',
          role: 'orders',
          access: 'invited',
          emailVerified: true,
        },
      ]),
    );

    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({
      isPrimary: false,
      role: 'Commandes',
      access: 'invited',
      emailVerified: true,
    });
  });

  it("dit « à préciser » plutôt que d'inventer un rôle", () => {
    // Un rôle deviné devient indistinguable d'un vrai, et personne ne sait
    // plus qu'il restait à remplir.
    const cards = toContactCards(detail([{ ...HOLDER, contactId: 'ct_2', role: null }]));

    expect(cards[1]?.role).toBe('Rôle à préciser');
  });
});
