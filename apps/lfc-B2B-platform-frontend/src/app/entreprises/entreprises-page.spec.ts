import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company } from '../account/account.model';
import { AccountService, type AccountStatus } from '../account/account.service';
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
    raisonSociale,
    enseigne,
    formeJuridique: 'SAS',
    siret: '81245678900021',
    tvaIntracom: '',
    status: 'pending',
    role: 'company_admin',
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
    expect(host.querySelector('fold-tabs')).toBeNull();
  });

  it('n’affiche PAS d’onglet pour une seule entreprise', () => {
    const host = render([company('c1', 'Boulangerie du Marais SAS')]);

    // La règle explicite : un onglet unique n'apporte rien.
    expect(host.querySelector('fold-tabs')).toBeNull();
    expect(host.querySelectorAll('app-entreprise-detail')).toHaveLength(1);
    expect(host.querySelector('fold-empty-state')).toBeNull();
  });

  it('affiche un onglet par entreprise dès qu’il y en a plusieurs', () => {
    const host = render([
      company('c1', 'Boulangerie du Marais SAS', 'Le Pain Quotidien'),
      company('c2', 'Torréfaction B SARL'),
    ]);

    expect(host.querySelector('fold-tabs')).not.toBeNull();
    expect(host.querySelectorAll('fold-tab-panel')).toHaveLength(2);
    // L'onglet porte l'enseigne quand elle existe, la raison sociale sinon.
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
