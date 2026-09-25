import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompany, CompanyStatus } from '../../comptes-clients/admin-company';
import { NouvelleCommandeProPage } from './nouvelle-commande-pro-page';

function makeCompany(
  id: string,
  raisonSociale: string,
  status: CompanyStatus,
  siret: string,
): AdminCompany {
  return {
    id,
    reference: `C-${id}`,
    raisonSociale,
    enseigne: '',
    formeJuridique: 'SAS',
    siret,
    siren: '',
    vatNumber: '',
    status,
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      role: null,
      id: null,
      firstName: 'A',
      lastName: 'B',
      fonction: '',
      email: '',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    activatedAt: null,
    warnings: [],
  };
}

const COMPANIES: readonly AdminCompany[] = [
  makeCompany('1', 'Café Périn', 'active', '81234567800019'),
  makeCompany('2', 'Hôtel du Port', 'active', '99988877700011'),
  makeCompany('3', 'Café en attente', 'pending', '11122233300044'),
  makeCompany('4', 'Café suspendu', 'suspended', '55566677700088'),
];

/** Expose l'état protégé sans cast : la page est testée par ce qu'elle dérive. */
class Harness extends NouvelleCommandeProPage {
  get visibleIds(): string[] {
    return this.rows().map((row) => row.id);
  }
  get loadState(): string {
    return this.state();
  }
  search(query: string): void {
    this.onSearchChange(query);
  }
  pick(id: string): void {
    this.choose(id);
  }
}

async function setup(list: () => Promise<readonly AdminCompany[]>): Promise<Harness> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: AdminCompaniesService,
        useValue: { list } satisfies Pick<AdminCompaniesService, 'list'>,
      },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new Harness());
  await Promise.resolve();
  await Promise.resolve();
  return page;
}

describe('NouvelleCommandeProPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ne propose que les comptes actifs', async () => {
    const page = await setup(() => Promise.resolve(COMPANIES));
    expect(page.loadState).toBe('ready');
    expect(page.visibleIds).toEqual(['1', '2']);
  });

  it('filtre par raison sociale, sans accents', async () => {
    const page = await setup(() => Promise.resolve(COMPANIES));
    page.search('perin');
    expect(page.visibleIds).toEqual(['1']);
  });

  it('filtre par SIRET dicté avec des espaces', async () => {
    const page = await setup(() => Promise.resolve(COMPANIES));
    page.search('999 888');
    expect(page.visibleIds).toEqual(['2']);
  });

  it('ne remonte pas un compte inactif même s’il correspond', async () => {
    const page = await setup(() => Promise.resolve(COMPANIES));
    page.search('café');
    expect(page.visibleIds).toEqual(['1']);
  });

  it('passe en erreur quand la liste ne se charge pas', async () => {
    const page = await setup(() => Promise.reject(new Error('hors service')));
    expect(page.loadState).toBe('error');
  });

  it('ouvre la saisie SOUS le comptoir, jamais vers /comptes-clients', async () => {
    const page = await setup(() => Promise.resolve(COMPANIES));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.pick('2');
    expect(navigate).toHaveBeenCalledWith(['/comptoir/nouvelle-commande', '2']);
  });
});

/** Arrive sur le sélecteur par une VRAIE navigation, avec l'état qu'y laisse la saisie. */
async function arriveWith(state: Record<string, unknown>): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'comptoir/nouvelle-commande', component: NouvelleCommandeProPage }]),
      {
        provide: AdminCompaniesService,
        useValue: {
          list: () => Promise.resolve(COMPANIES),
        } satisfies Pick<AdminCompaniesService, 'list'>,
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await TestBed.inject(Router).navigate(['/comptoir/nouvelle-commande'], { state });
  harness.detectChanges();
  return harness.routeNativeElement ?? document.createElement('div');
}

describe('NouvelleCommandeProPage — retour de la saisie', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('AFFICHE le lien de règlement de la commande passée : le client est en face', async () => {
    const host = await arriveWith({
      counterPlacedOrder: { orderNumber: 'CMD-42', paymentUrl: 'https://pay.example/abc' },
    });
    expect(host.textContent).toContain('Commande CMD-42 enregistrée.');
    expect(host.querySelector('.url')?.textContent).toBe('https://pay.example/abc');
  });

  it('ne montre aucun lien quand la commande n’en a pas', async () => {
    const host = await arriveWith({
      counterPlacedOrder: { orderNumber: 'CMD-43', paymentUrl: null },
    });
    expect(host.textContent).toContain('Commande CMD-43 enregistrée.');
    expect(host.querySelector('.url')).toBeNull();
  });

  it('ne montre rien quand on arrive sans commande', async () => {
    const host = await arriveWith({});
    expect(host.textContent).not.toContain('enregistrée');
  });
});
