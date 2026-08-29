import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company, UserProfile } from '../../../account/account.model';
import { AccountService, type AccountStatus } from '../../../account/account.service';
import { EntreprisesPage } from './entreprises-page';

/**
 * Les trois états de la page, qui sont **la** règle d'affichage demandée :
 * aucune entreprise → empty state ; une → la fiche sans onglet ; plusieurs → un
 * onglet chacune. On les exerce par le DOM rendu, pas par les signaux internes :
 * c'est le rendu qui compte pour l'utilisateur.
 */
function company(id: string, raisonSociale: string, enseigne = ''): Company {
  return {
    id,
    reference: 'C-TEST01',
    raisonSociale,
    enseigne,
    formeJuridique: 'SAS',
    siret: '81245678900021',
    vatNumber: '',
    vatNumberRequired: true,
    status: 'pending',
    grantedTerms: [],
    requestedTerm: null,
    role: 'admin',
    primaryContact: {
      id: null,
      firstName: 'Camille',
      lastName: 'Rousseau',
      fonction: '',
      email: 'camille@test.fr',
      phone: '',
      role: null,
    },
    contacts: [],
    kbis: null,
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
  };
}

/** Double du service compte : des signaux nus, pilotés par chaque test. */
class AccountServiceDouble {
  readonly companiesSignal: WritableSignal<readonly Company[]> = signal([]);
  readonly statusSignal: WritableSignal<AccountStatus> = signal<AccountStatus>('ready');

  readonly companies = this.companiesSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  readonly hasNoCompany = signal(false);
  // La page rend `app-entreprise-detail` → `app-company-contacts-section`, qui lit
  // `profile()` pour le badge « Vous ». `null` suffit : aucun test ici ne
  // l'exerce, mais l'appel doit exister sous peine de plantage au rendu.
  readonly profile = signal<UserProfile | null>(null).asReadonly();

  sync(): void {
    this.hasNoCompany.set(this.statusSignal() === 'ready' && this.companiesSignal().length === 0);
  }
}

let account: AccountServiceDouble;

function render(companies: readonly Company[], status: AccountStatus = 'ready'): HTMLElement {
  account.companiesSignal.set(companies);
  account.statusSignal.set(status);
  account.sync();

  const fixture = TestBed.createComponent(EntreprisesPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

beforeEach(() => {
  account = new AccountServiceDouble();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AccountService, useValue: account },
      // Le host de panneaux vit dans le shell de l'app, absent du test : seule
      // l'ouverture nous intéresserait, et aucun test ici ne clique « Créer ».
      { provide: FoldPanelHostService, useValue: { open: (): void => undefined } },
    ],
  });
});

describe('EntreprisesPage', () => {
  it('affiche un empty state avec « Créer une entreprise » quand il n’y en a aucune', () => {
    const host = render([]);

    expect(host.querySelector('fold-empty-state')).not.toBeNull();
    expect(host.textContent).toContain('Aucune entreprise');
    expect(host.querySelector('app-entreprise-detail')).toBeNull();
    expect(host.querySelector('fold-view-nav')).toBeNull();
  });

  it('n’affiche PAS de barre pour une seule entreprise', () => {
    const host = render([company('c1', 'Boulangerie du Marais SAS')]);

    // La règle explicite : un sélecteur d'un seul élément n'apporte rien.
    expect(host.querySelector('fold-view-nav')).toBeNull();
    expect(host.querySelectorAll('app-entreprise-detail')).toHaveLength(1);
    expect(host.querySelector('fold-empty-state')).toBeNull();
  });

  it('affiche une barre nav et la fiche active dès qu’il y a plusieurs entreprises', () => {
    const host = render([
      company('c1', 'Boulangerie du Marais SAS', 'Le Pain Quotidien'),
      company('c2', 'Torréfaction B SARL'),
    ]);

    // Une barre nav (pas un bandeau d'onglets), et UNE seule fiche rendue —
    // celle de l'entreprise active, les autres n'existent pas dans le DOM.
    expect(host.querySelector('fold-view-nav')).not.toBeNull();
    expect(host.querySelectorAll('app-entreprise-detail')).toHaveLength(1);
    // La barre porte l'enseigne quand elle existe, la raison sociale sinon.
    expect(host.textContent).toContain('Le Pain Quotidien');
    expect(host.textContent).toContain('Torréfaction B SARL');
  });

  it('ne montre pas l’empty state tant que le compte n’est pas chargé', () => {
    // Sinon « Aucune entreprise » clignoterait à chaque chargement de page, en
    // affirmant quelque chose qu'on ne sait pas encore.
    const host = render([], 'loading');

    expect(host.querySelector('fold-empty-state')).toBeNull();
    expect(host.textContent).toContain('Chargement');
  });
});
