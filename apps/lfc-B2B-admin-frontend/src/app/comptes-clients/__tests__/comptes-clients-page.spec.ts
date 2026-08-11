import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PortfolioMetricsView } from '@lfd/contracts';

import { PendingAlertsService } from '../../shared/alerts/pending-alerts.service';
import { PortfolioMetricsService } from '../portfolio-metrics.service';
import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany, CompanyStatus } from '../admin-company';
import { ComptesClientsPage } from '../comptes-clients-page';

/** Fabrique une société d'un statut donné (le reste des champs importe peu ici). */
function makeCompany(
  id: string,
  status: CompanyStatus,
  hasOpenSupportRequest = false,
): AdminCompany {
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
    owner: null,
    hasOpenSupportRequest,
    createdAt: '2026-07-30T10:00:00.000Z',
  };
}

const COMPANIES: readonly AdminCompany[] = [
  makeCompany('1', 'pending'), // en attente de vérification
  makeCompany('2', 'pending', true), // assistance demandée
  makeCompany('3', 'active'),
  makeCompany('4', 'suspended'),
  makeCompany('5', 'terminated'),
];

/** Instancie la page avec un service qui renvoie `companies`, load() résolu. */
async function setup(
  companies: readonly AdminCompany[] = COMPANIES,
  counts: Promise<Readonly<Record<string, number>>> = Promise.resolve({}),
): Promise<ComptesClientsPage> {
  TestBed.configureTestingModule({
    providers: [
      // L'en-tête porte un `routerLink` vers la page de création : sans routeur,
      // le rendu du gabarit échoue avant la première assertion.
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: AdminCompaniesService,
        useValue: { list: (): Promise<readonly AdminCompany[]> => Promise.resolve(companies) },
      },
      {
        provide: PortfolioMetricsService,
        useValue: {
          load: (): Promise<PortfolioMetricsView> => Promise.reject(new Error('hors service')),
        } satisfies Pick<PortfolioMetricsService, 'load'>,
      },
      {
        provide: PendingAlertsService,
        useValue: { counts: () => counts } satisfies Pick<PendingAlertsService, 'counts'>,
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

  it('sépare les deux files de pending pour les badges', async () => {
    const page = await setup();
    // company 1 = pending sans support, company 2 = pending + support ouvert.
    expect(page['awaitingActivationCount']()).toBe(1);
    expect(page['assistanceCount']()).toBe(1);
  });

  it('marque comme assistance un pending avec demande de support ouverte', async () => {
    const page = await setup();
    expect(page['isAssistance'](makeCompany('a', 'pending', false))).toBe(false);
    expect(page['isAssistance'](makeCompany('b', 'pending', true))).toBe(true);
  });

  it('ne marque pas assistance un non-pending même avec support ouvert', async () => {
    const page = await setup([makeCompany('9', 'active', true)]);
    expect(page['isAssistance'](makeCompany('9', 'active', true))).toBe(false);
    expect(page['assistanceCount']()).toBe(0);
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

  it('porte la pastille sur les seuls comptes qui ont des alertes en attente', async () => {
    const page = await setup(COMPANIES, Promise.resolve({ '3': 2 }));

    expect(page['pendingAlertsOf'](makeCompany('3', 'active'))).toBe(2);
    // L'absence vaut zéro : le serveur n'envoie pas une ligne par compte pour
    // dire « rien ».
    expect(page['pendingAlertsOf'](makeCompany('1', 'pending'))).toBe(0);
  });

  it('affiche la liste même si le compte des alertes échoue', async () => {
    // La pastille est un rappel, pas la liste. La faire tomber avec elle
    // priverait le commercial de son écran de travail pour une décoration.
    const page = await setup(COMPANIES, Promise.reject(new Error('hors service')));

    expect(page['state']()).toBe('ready');
    expect(page['pendingAlertsOf'](makeCompany('3', 'active'))).toBe(0);
  });

  it('ne montre que la page courante, et rembobine quand on filtre', async () => {
    const page = await setup(COMPANIES);
    page['pageSize'].set(2);

    expect(page['paged']().map((c) => c.id)).toEqual(['1', '2']);

    page['page'].set(3);
    expect(page['paged']().map((c) => c.id)).toEqual(['5']);

    // Filtrer réduit la liste sous la page courante : sans recalage, l'écran
    // afficherait une page vide alors que le contenu est plus haut.
    page['onFilterChange']('active');
    expect(page['clampedPage']()).toBe(1);
    expect(page['paged']()).toHaveLength(1);
  });

  it("contextualise l'état vide au segment actif", async () => {
    const page = await setup([]);
    expect(page['emptyState']().title).toContain('Aucune société');

    page['onFilterChange']('suspended');
    expect(page['emptyState']().title).toContain('Suspendu');
  });
});
