import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CustomerBankAccountSectionView, CustomerBankAccountView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { ClientBankAccount } from './client-bank-account.service';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

const ACCOUNT: CustomerBankAccountView = {
  holder: 'SAS Les Tommeuses',
  holderLegalForm: 'SAS',
  addressLine1: '12 chemin des Barmettes',
  addressLine2: '',
  postalCode: '73150',
  city: "Val d'Isère",
  countryCode: 'FR',
  bic: 'AGRIFRPP881',
  last4: '1234',
};
const SECTION_A: CustomerBankAccountSectionView = { account: ACCOUNT };
const SECTION_B: CustomerBankAccountSectionView = { account: { ...ACCOUNT, last4: '9876' } };

const of_ =
  (id: string) =>
  (r: { url: string }): boolean =>
    r.url.endsWith(`/companies/${id}/bank-account`);

interface Booted {
  readonly http: HttpTestingController;
  readonly bank: ClientBankAccount;
  readonly workspace: WorkspaceDouble;
}

function boot(): Booted {
  const workspace = workspaceDouble('cmp_1', [TOMMEUSES, { ...TOMMEUSES, id: 'cmp_b' }]);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => true, accessToken$: () => of('jeton') },
      },
      provideWorkspace(workspace),
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    bank: TestBed.inject(ClientBankAccount),
    workspace,
  };
}

/** Le jeton, puis la requête. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('le RIB du client', () => {
  it('lit le RIB une seule fois pour deux cartes, avec le jeton et l’en-tête de la société', async () => {
    const { http, bank } = boot();
    expect(bank.status()).toBe('loading');
    bank.ensure('cmp_1');
    bank.ensure('cmp_1');
    await settle();
    const request = http.expectOne(of_('cmp_1'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    expect(request.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_1');
    request.flush(SECTION_A);
    await settle();

    expect(bank.status()).toBe('ready');
    expect(bank.account()).toEqual(SECTION_A.account);
    bank.ensure('cmp_1');
    await settle();
    http.verify();
  });

  it('un échec est un état, la dernière lecture reste, « Réessayer » relit', async () => {
    const { http, bank } = boot();
    bank.ensure('cmp_1');
    await settle();
    http.expectOne(of_('cmp_1')).flush(SECTION_A);
    await settle();

    const failing = bank.reload('cmp_1');
    await settle();
    http.expectOne(of_('cmp_1')).flush({}, { status: 500, statusText: 'Server Error' });
    await failing;
    expect(bank.status()).toBe('failed');
    expect(bank.account()).toEqual(SECTION_A.account);

    const retry = bank.reload('cmp_1');
    expect(bank.status()).toBe('ready');
    await settle();
    http.expectOne(of_('cmp_1')).flush(SECTION_B);
    await retry;
    expect(bank.account()).toEqual(SECTION_B.account);
  });

  /**
   * Lot d (brique par clé de contexte) : le RIB de la société quittée
   * restait affiché sous le nom de la suivante jusqu'à sa réponse.
   */
  it('rien de l’ancien espace n’est rendu après une bascule', async () => {
    const { http, bank, workspace } = boot();
    bank.ensure('cmp_1');
    await settle();
    http.expectOne(of_('cmp_1')).flush(SECTION_A);
    await settle();
    expect(bank.account()).toEqual(SECTION_A.account);

    workspace.current.set('cmp_b');
    TestBed.tick();
    expect(bank.account()).toBeNull();
    expect(bank.status()).toBe('loading');

    bank.ensure('cmp_b');
    await settle();
    const next = http.expectOne(of_('cmp_b'));
    expect(next.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_b');
    next.flush(SECTION_B);
    await settle();
    expect(bank.account()).toEqual(SECTION_B.account);
  });
});
