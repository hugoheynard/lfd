import type { CompanyContactView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { contactTargetOf, knownContactsOf } from '../informations/fiche-client.panels';

const HOLDER = {
  contactId: null,
  firstName: 'Camille',
  lastName: 'Rousseau',
  fonction: 'Gérante',
  email: 'camille@halles.fr',
  phone: '0600000000',
  role: 'owner',
} as CompanyContactView;

const KARIM = {
  contactId: 'ct_1',
  firstName: 'Karim',
  lastName: 'Benali',
  fonction: 'Réception',
  email: 'achats@halles.fr',
  phone: '',
  role: 'orders',
} as CompanyContactView;

function company(contacts: readonly CompanyContactView[] = [HOLDER, KARIM]): AdminCompanyDetail {
  return {
    id: 'cmp_1',
    contacts,
    primaryContact: {
      id: null,
      firstName: 'Camille',
      lastName: 'Rousseau',
      fonction: 'Gérante',
      email: 'camille@halles.fr',
      phone: '0600000000',
    },
  } as AdminCompanyDetail;
}

describe('cible du panneau de contact', () => {
  it('reconnaît le DÉTENTEUR à son absence d’identifiant', () => {
    // Il vit aplati sur la société : c'est ce qui le distingue, pas un drapeau.
    const { target, initial } = contactTargetOf(company(), null, false);

    expect(target).toEqual({ kind: 'primary' });
    expect(initial.email).toBe('camille@halles.fr');
  });

  it('n’offre PAS le rôle « détenteur » au préremplissage', () => {
    // Un rôle constaté, absent des choix : le redescendre dans le brouillon
    // laisserait croire qu'une société peut en avoir deux.
    const { initial } = contactTargetOf(company(), null, false);

    expect(initial.role).toBe('');
  });

  it('préremplit un interlocuteur existant, rôle compris', () => {
    const { target, initial } = contactTargetOf(company(), 'ct_1', false);

    expect(target).toEqual({ kind: 'additional', contactId: 'ct_1' });
    expect(initial).toMatchObject({ email: 'achats@halles.fr', role: 'orders' });
  });

  it('part d’un brouillon VIDE pour un nouveau contact', () => {
    // Même avec un id qui traîne : « nouveau » veut dire nouveau.
    const { target, initial } = contactTargetOf(company(), 'ct_1', true);

    expect(target).toEqual({ kind: 'additional', contactId: null });
    expect(initial.email).toBe('');
  });

  it('retombe sur un brouillon vide si l’identifiant est inconnu', () => {
    // Une fiche rechargée pendant qu'on cliquait ne doit pas ouvrir un panneau
    // sur les coordonnées de quelqu'un d'autre.
    const { initial } = contactTargetOf(company(), 'ct_fantome', false);

    expect(initial.email).toBe('');
  });
});

describe('contacts connus proposés à une adresse de livraison', () => {
  it('propose le contact principal', () => {
    expect(knownContactsOf(company())).toEqual([
      { prenom: 'Camille', nom: 'Rousseau', telephone: '0600000000' },
    ]);
  });

  it('ne propose RIEN quand il n’a pas de nom', () => {
    // Un compte ouvert à l'adresse seule : proposer « (vide) » au livreur ne
    // rendrait service à personne.
    const anonymous = {
      ...company(),
      primaryContact: { id: null, firstName: '', lastName: '', fonction: '', email: '', phone: '' },
    } as AdminCompanyDetail;

    expect(knownContactsOf(anonymous)).toEqual([]);
  });
});
