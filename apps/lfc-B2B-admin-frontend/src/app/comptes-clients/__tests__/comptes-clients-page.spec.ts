import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany, CompanyStatus } from '../admin-company';
import { ComptesClientsPage } from '../comptes-clients-page';

/** Fabrique une société d'un statut donné (le reste des champs importe peu ici). */
function makeCompany(id: string, status: CompanyStatus): AdminCompany {
  return {
    id,
    reference: `C-${id}`,
    raisonSociale: `Société ${id}`,
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '12345678901234',
    tvaIntracom: 'FR12345678901',
    status,
    paymentTerm: 'per_order',
    requestedPaymentTerm: null,
    primaryContact: { id: null, firstName: 'A', lastName: 'B', fonction: '', email: '', phone: '' },
    kbis: null,
    createdAt: '2026-07-30T10:00:00.000Z',
  };
}

const COMPANIES: readonly AdminCompany[] = [
  makeCompany('1', 'pending'),
  makeCompany('2', 'pending'),
  makeCompany('3', 'active'),
  makeCompany('4', 'suspended'),
  makeCompany('5', 'terminated'),
];

/** Instancie la page avec un service qui renvoie `companies`, load() résolu. */
async function setup(companies: readonly AdminCompany[] = COMPANIES): Promise<ComptesClientsPage> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompaniesService,
        useValue: { list: (): Promise<readonly AdminCompany[]> => Promise.resolve(companies) },
      },
    ],
  });
  const page = TestBed.createComponent(ComptesClientsPage).componentInstance;
  await Promise.resolve();
  await Promise.resolve();
  return page;
}

describe('ComptesClientsPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('charge les sociétés et passe à ready', async () => {
    const page = await setup();
    expect(page['state']()).toBe('ready');
    expect(page['companies']()).toHaveLength(5);
  });

  it('compte les comptes en attente pour le badge', async () => {
    const page = await setup();
    expect(page['pendingCount']()).toBe(2);
  });

  it("montre tout quand le filtre est 'all'", async () => {
    const page = await setup();
    expect(page['filtered']()).toHaveLength(5);
  });

  it('ne garde que le statut sélectionné', async () => {
    const page = await setup();
    page['onFilterChange']('active');
    expect(page['filtered']().map((c) => c.status)).toEqual(['active']);

    page['onFilterChange']('pending');
    expect(page['filtered']()).toHaveLength(2);

    page['onFilterChange']('terminated');
    expect(page['filtered']().map((c) => c.id)).toEqual(['5']);
  });

  it('ignore une valeur de filtre inconnue', async () => {
    const page = await setup();
    page['onFilterChange']('active');
    page['onFilterChange']('bogus');
    expect(page['filter']()).toBe('active');
  });

  it("contextualise l'état vide au segment actif", async () => {
    const page = await setup([]);
    expect(page['emptyState']().title).toContain('Aucune société');

    page['onFilterChange']('suspended');
    expect(page['emptyState']().title).toContain('Suspendu');
  });
});
