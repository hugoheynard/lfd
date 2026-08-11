import { Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company, Contact, UserProfile } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import { CompanyContactsSection } from './company-contacts-section';

/**
 * Les règles d'affichage de la section, exercées par le DOM rendu :
 * l'ordre (admin en tête), le badge « Vous », le verrou lecture seule pour un
 * non-gestionnaire, et le « Supprimer » réservé aux contacts additionnels.
 */
function contact(email: string, firstName = 'Jean', lastName = 'Client'): Contact {
  return { id: `ct_${email}`, firstName, lastName, fonction: '', email, phone: '' };
}

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    reference: 'C-TEST01',
    raisonSociale: 'Boulangerie du Marais SAS',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '81245678900021',
    tvaIntracom: '',
    vatNumberRequired: true,
    status: 'active',
    paymentTerm: 'per_order',
    requestedPaymentTerm: null,
    role: 'company_admin',
    primaryContact: {
      id: null,
      firstName: 'Camille',
      lastName: 'Rousseau',
      fonction: '',
      email: 'gerant@pqmarais.fr',
      phone: '',
    },
    contacts: [],
    kbis: null,
    ...over,
  };
}

/** Hôte de test : fixe l'input `company` requis. */
@Component({
  imports: [CompanyContactsSection],
  template: `<app-company-contacts-section [company]="company()" />`,
})
class Host {
  readonly company: WritableSignal<Company> = signal(company());
}

let profileEmail: string | null;

function render(c: Company): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.company.set(c);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

beforeEach(() => {
  profileEmail = 'gerant@pqmarais.fr';
  const accountStub = {
    profile: (): Pick<UserProfile, 'email'> | null =>
      profileEmail === null ? null : ({ email: profileEmail } as UserProfile),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AccountService, useValue: accountStub },
      { provide: FoldPanelHostService, useValue: { open: (): void => undefined } },
    ],
  });
});

describe('CompanyContactsSection', () => {
  it('place le contact principal en premier, badgé « Vous » quand c’est vous', () => {
    const host = render(company({ contacts: [contact('achats@pqmarais.fr')] }));
    const cards = host.querySelectorAll('fold-card');

    expect(cards).toHaveLength(2);
    // Première carte = l'admin (le contact principal).
    expect(cards[0]?.textContent).toContain('Détenteur du compte');
    expect(cards[0]?.querySelector('fold-badge')).not.toBeNull();
    expect(cards[0]?.textContent).toContain('Vous');
  });

  it('n’affiche pas le badge « Vous » quand le contact n’est pas la personne connectée', () => {
    profileEmail = 'quelquun.dautre@ailleurs.fr';
    const host = render(company());

    expect(host.querySelector('fold-badge')).toBeNull();
  });

  it('propose « Ajouter » et un menu par carte au gestionnaire', () => {
    const host = render(company({ contacts: [contact('achats@pqmarais.fr')] }));

    expect(host.textContent).toContain('Ajouter un contact');
    // Un menu (dropover) par carte.
    expect(host.querySelectorAll('fold-dropdown')).toHaveLength(2);
  });

  it('passe en lecture seule pour un simple membre (ni ajout, ni menu)', () => {
    // L'UI ne propose pas ce que le mur backend refuserait de toute façon.
    const host = render(company({ role: 'member', contacts: [contact('x@y.fr')] }));

    expect(host.textContent).not.toContain('Ajouter un contact');
    expect(host.querySelector('fold-dropdown')).toBeNull();
  });

  it('n’offre « Supprimer » que sur les contacts additionnels', () => {
    const host = render(company({ contacts: [contact('achats@pqmarais.fr')] }));
    const cards = host.querySelectorAll('fold-card');

    // Le principal (carte 0) : pas de suppression. L'additionnel (carte 1) : oui.
    expect(cards[0]?.querySelectorAll('fold-dropdown-item')).toHaveLength(1);
    expect(cards[1]?.querySelectorAll('fold-dropdown-item')).toHaveLength(2);
  });

  it('signale que les contacts additionnels n’ont pas d’espace utilisateur, avec « Inviter »', () => {
    const host = render(company({ contacts: [contact('achats@pqmarais.fr')] }));
    const cards = host.querySelectorAll('fold-card');

    // Le principal (une personne, un compte) : pas de callout. L'additionnel : oui.
    expect(cards[0]?.querySelector('fold-callout')).toBeNull();
    expect(cards[1]?.querySelector('fold-callout')).not.toBeNull();
    expect(cards[1]?.textContent).toContain("pas d'espace utilisateur");
    expect(cards[1]?.textContent).toContain('Inviter');
  });

  it('n’ouvre AUCUNE confirmation de suppression d’office (ni sur « Vous »)', () => {
    // Régression : le principal a un id `null` ; `confirmingId()` initial `null`
    // faisait `null === null` → une confirmation « Supprimer ce contact » ouverte
    // d'office sur la carte du propriétaire. Aucune ne doit être rendue au repos.
    const host = render(company({ contacts: [contact('achats@pqmarais.fr')] }));

    expect(host.querySelector('fold-inline-confirm')).toBeNull();
  });
});
