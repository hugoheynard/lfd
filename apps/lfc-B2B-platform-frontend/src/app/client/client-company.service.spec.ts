import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';

import { AccountService, type AccountStatus } from '../account/account.service';
import { ClientCompany } from './client-company.service';

function boot(status: AccountStatus, companies: readonly CompanyView[]): ClientCompany {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AccountService,
        useValue: {
          status: signal(status).asReadonly(),
          companies: () => companies,
          account: () => ({ companies, navPrefs: { catalogueView: null, workspace: null } }),
        },
      },
    ],
  });
  return TestBed.inject(ClientCompany);
}

const company = (status: CompanyView['status']): CompanyView =>
  ({ id: 'cmp_1', status, enseigne: 'La Maison', raisonSociale: 'SAS La Maison' }) as CompanyView;

/**
 * Régression (2026-09-14) : la pastille de Mon compte disait « Compte actif ·
 * dossier complet » en dur, y compris à un compte sans société.
 */
describe('ClientCompany.dossier', () => {
  it('ne dit rien tant que le compte n’est pas lu', () => {
    expect(boot('loading', []).dossier()).toBeNull();
    expect(boot('error', []).dossier()).toBeNull();
  });

  it('dit « à compléter » à un compte lu sans société', () => {
    expect(boot('ready', []).dossier()).toBe('incomplete');
  });

  it('suit le statut de la société', () => {
    expect(boot('ready', [company('pending')]).dossier()).toBe('pending');
    expect(boot('ready', [company('active')]).dossier()).toBe('active');
  });
});
