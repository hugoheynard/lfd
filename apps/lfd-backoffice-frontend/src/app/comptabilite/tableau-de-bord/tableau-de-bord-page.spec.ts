import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type {
  BillingCycleView,
  CatalogSummaryView,
  CollectionPreviewView,
  CustomerPortfolioView,
  LegalEntityView,
} from '@lfd/contracts';

import { CollectionBatchesService } from '../collection-batches.service';
import { ComptabiliteDashboardService } from '../comptabilite-dashboard.service';
import { LegalEntitiesService } from '../legal-entities.service';
import { TableauDeBordPage } from './tableau-de-bord-page';

/**
 * 🔴 Ce que ces cas tiennent avant tout : **une brique absente ne s'affiche
 * jamais comme un zéro.**
 *
 * « 0 facture à collecter » dirait « rien à encaisser » ; la phrase vraie est
 * « on ne sait pas encore compter ». C'est la décision de conception de cet
 * écran, et la seule qu'un futur ajout de carte puisse défaire sans s'en
 * apercevoir.
 */
function portfolio(over: Partial<CustomerPortfolioView> = {}): CustomerPortfolioView {
  return { active: 84, pending: 3, suspended: 1, newlyActive: 6, ...over };
}

function catalog(over: Partial<CatalogSummaryView> = {}): CatalogSummaryView {
  return { onSale: 312, withoutVatRate: 0, hidden: 4, ...over };
}

function entity(over: Partial<LegalEntityView> = {}): LegalEntityView {
  return {
    id: 'le1',
    name: 'La Folie Douce',
    legalForm: 'SAS',
    siren: '552100554',
    vatNumber: '',
    rcs: '',
    shareCapitalCents: 0,
    addressLine1: '12 rue du Fournil',
    addressLine2: '',
    postalCode: '73000',
    city: 'Chambéry',
    countryCode: 'FR',
    ics: '',
    creditorBic: '',
    creditorAccountHolder: '',
    creditorAccountLine1: '',
    creditorAccountLine2: '',
    creditorAccountPostalCode: '',
    creditorAccountCity: '',
    creditorAccountCountryCode: '',
    creditorIdentityFrozen: false,
    creditorAccountLast4: '',
    preNotificationDays: 14,
    autoCollectionEnabled: false,
    autoCollectionDelayHours: 1,
    collectionDaysAfterClosure: null,
    depositCutoff: null,
    nextCollection: {
      closesAt: '2026-10-31T23:00:00.000Z',
      plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
      collectionDay: '2026-11-16',
      depositDeadline: null,
    },
    mandateContractDescription: '',
    mandatePaymentType: 'recurrent',
    mandateScheme: 'B2B',
    archivedAt: null,
    canCollect: false,
    hasLogo: false,
    lastAutopilotRun: null,
    isLastActive: false,
    missingToCollect: ["l'identifiant créancier (ICS)"],
    ...over,
  };
}

/**
 * Un cycle d'été : minuit à Paris s'écrit `T22:00:00Z`. Ces instants sont le
 * sujet du test et ne sont comparés qu'entre eux — jamais à l'horloge.
 */
function cycle(): BillingCycleView {
  return { startsAt: '2026-08-31T22:00:00.000Z', closesAt: '2026-09-30T22:00:00.000Z' };
}

class FakeDashboard {
  customersValue = portfolio();
  catalogValue = catalog();
  cycleValue: BillingCycleView | null = cycle();
  readonly downloaded: string[] = [];

  billingCycle(): Promise<BillingCycleView> {
    return this.cycleValue === null
      ? Promise.reject(new Error('cycle indisponible'))
      : Promise.resolve(this.cycleValue);
  }

  customers(): Promise<CustomerPortfolioView> {
    return Promise.resolve(this.customersValue);
  }
  catalog(): Promise<CatalogSummaryView> {
    return Promise.resolve(this.catalogValue);
  }
  customersCsv(): Promise<Blob> {
    this.downloaded.push('comptes');
    return Promise.resolve(new Blob(['x']));
  }
  catalogCsv(): Promise<Blob> {
    this.downloaded.push('catalogue');
    return Promise.resolve(new Blob(['x']));
  }
}

class FakeEntities {
  rows: readonly LegalEntityView[] = [entity()];
  list(): Promise<readonly LegalEntityView[]> {
    return Promise.resolve(this.rows);
  }
}

class FakeBatches {
  view: CollectionPreviewView | null = {
    state: 'open',
    cycleStartsAt: '2026-09-30T22:00:00.000Z',
    cycleClosesAt: '2026-10-31T23:00:00.000Z',
    floorAt: '2026-08-01T00:00:00.000Z',
    lines: [],
    totalCents: 123_456,
    ordersTotalCents: 123_460,
    exclusions: [],
    unmandatedCompanies: [],
  };
  preview(): Promise<CollectionPreviewView> {
    return this.view === null
      ? Promise.reject(new Error('aperçu indisponible'))
      : Promise.resolve(this.view);
  }
}

async function render(
  api = new FakeDashboard(),
  entities = new FakeEntities(),
  batches = new FakeBatches(),
): Promise<{ fixture: ComponentFixture<TableauDeBordPage>; api: FakeDashboard }> {
  TestBed.configureTestingModule({
    imports: [TableauDeBordPage],
    providers: [
      // Les cartes portent des `routerLink` vers les écrans voisins ; sans
      // routeur, c'est `ActivatedRoute` qui manque, et la page ne rend rien.
      provideRouter([]),
      { provide: ComptabiliteDashboardService, useValue: api },
      { provide: LegalEntitiesService, useValue: entities },
      { provide: CollectionBatchesService, useValue: batches },
    ],
  });
  const fixture: ComponentFixture<TableauDeBordPage> = TestBed.createComponent(TableauDeBordPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

const text = (fixture: ComponentFixture<TableauDeBordPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('TableauDeBordPage', () => {
  it('🔴 la carte Facturation dit ce qui fait foi, sans compter de factures', async () => {
    const { fixture } = await render();
    const billing = (fixture.nativeElement as HTMLElement).querySelector('[data-billing]');

    // « Nous n'émettons pas de factures » était FAUX depuis l'arrêté de
    // facturation (F3) : réécrite le 2026-10-08 (PA4).
    expect(billing?.textContent).toContain("L'arrêté de facturation fait foi");
    expect(billing?.textContent).toContain('Factur-X');
    expect(text(fixture)).not.toContain("Nous n'émettons pas de factures");
    // Le mot « facture » ne doit jamais côtoyer un nombre sur cet écran.
    expect(text(fixture)).not.toMatch(/\d+\s*factures?\b/u);
  });

  /**
   * 🔴 **Régression : la bande de tête a été sombre sans que les encres le
   * sachent.** `foldSurface="chrome"` était écrit dans le gabarit, mais
   * `FoldSurfaceDirective` manquait aux `imports` du composant — l'attribut
   * restait donc du HTML inerte qu'Angular ignore. Le fond, peint à la main en
   * SCSS, devenait sombre ; la polarité du texte ne basculait jamais. Le titre
   * tombait à **1,18 de contraste** là où il en faut 3.
   *
   * Rien ne pouvait le dire : le typecheck ne lit pas les gabarits, l'AOT
   * accepte un attribut inconnu sur un élément connu (c'est du HTML valide), et
   * `lint:fold-tokens` passait puisque le token employé était le bon. Seul
   * l'écran le disait — d'où ce test, qui regarde ce que la directive STAMPE
   * plutôt que ce que le gabarit déclare (constaté le 2026-09-10).
   */
  it('déclare la bande de tête comme surface de chrome, encres comprises', async () => {
    const { fixture } = await render();

    const masthead = (fixture.nativeElement as HTMLElement).querySelector('.masthead');
    expect(masthead?.getAttribute('data-surface')).toBe('chrome');
  });

  it('porte les quatre chiffres du bandeau', async () => {
    const { fixture } = await render();
    const body = text(fixture);

    expect(body).toContain('Clients actifs');
    expect(body).toContain('84');
    expect(body).toContain('Nouveaux sur 30 j');
    expect(body).toContain('Articles en vente');
  });

  it('dit les dossiers en attente et les comptes suspendus, pas seulement les actifs', async () => {
    const { fixture } = await render();

    expect(text(fixture)).toContain('3 dossier(s) en attente');
    expect(text(fixture)).toContain('1 compte(s) suspendu(s)');
  });

  it('🔴 alerte sur les articles sans taux de TVA — ils quittent la vente en silence', async () => {
    const api = new FakeDashboard();
    api.catalogValue = catalog({ withoutVatRate: 7 });

    const { fixture } = await render(api);

    expect(text(fixture)).toContain('7 article(s) sans taux de TVA');
    expect(text(fixture)).toContain('ne sont pas vendables pour autant');
  });

  it('ne dit rien du taux de TVA quand tout est réglé', async () => {
    const { fixture } = await render();

    expect(text(fixture)).not.toContain('sans taux de TVA.');
  });

  it("nomme ce qui manque à l'émetteur plutôt que d'attendre sa tranche", async () => {
    const { fixture } = await render();

    expect(text(fixture)).toContain('Aucun émetteur ne peut encaisser');
    expect(text(fixture)).toContain("l'identifiant créancier (ICS)");
  });

  it('annonce un émetteur prêt dès qu’UNE entité peut encaisser', async () => {
    const entities = new FakeEntities();
    entities.rows = [
      // Une seconde entité en cours de montage ne doit pas faire dire que rien
      // ne peut partir : prélever demande UN émetteur prêt, pas tous.
      entity({ id: 'le2', name: 'En montage' }),
      entity({ id: 'le1', ics: 'FR72ZZZ123456', canCollect: true, missingToCollect: [] }),
    ];

    const { fixture } = await render(new FakeDashboard(), entities);

    expect(text(fixture)).toContain('Émetteur prêt');
    expect(text(fixture)).toContain('FR72ZZZ123456');
    expect(text(fixture)).not.toContain('Aucun émetteur');
  });

  it('porte la barre du cycle, bornes rendues en heure locale', async () => {
    const { fixture } = await render();
    const body = text(fixture);

    expect(body).toContain('Cycle de prélèvement');
    // Les bornes du cycle d'été : minuit à Paris, jamais les composantes UTC.
    expect(body).toContain('1 septembre 2026');
    expect(body).toContain('1 octobre 2026');
    expect(body).not.toContain('30 septembre 2026');
  });

  it('🔴 un cycle illisible coûte sa bande, pas le tableau de bord', async () => {
    const api = new FakeDashboard();
    api.cycleValue = null;

    const { fixture } = await render(api);
    const body = text(fixture);

    expect(body).toContain('Cycle de prélèvement illisible.');
    // Le reste tient : c'est tout l'objet d'un échec PARTIEL.
    expect(body).toContain('Clients actifs');
    expect(body).toContain('Comptes clients');
  });

  it('télécharge les deux CSV depuis leurs boutons', async () => {
    const { fixture, api } = await render();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].filter(
      (button) => button.textContent?.includes('Exporter le CSV') === true,
    );

    expect(buttons).toHaveLength(2);
    buttons[0]?.click();
    buttons[1]?.click();
    await fixture.whenStable();

    expect(api.downloaded).toEqual(['comptes', 'catalogue']);
  });
});

describe('TableauDeBordPage — le résumé du prélèvement du mois', () => {
  const ready = (): FakeEntities => {
    const entities = new FakeEntities();
    entities.rows = [entity({ ics: 'FR72ZZZ123456', canCollect: true, missingToCollect: [] })];
    return entities;
  };

  it('dit la prochaine date, le montant de l’aperçu, et mène à l’écran du mois', async () => {
    const { fixture } = await render(new FakeDashboard(), ready());
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-next-collection]')?.textContent).toContain('16 nov. 2026');
    expect(host.querySelector('[data-preview-summary]')?.textContent).toMatch(/1\s?234,56\s€/u);
    const link = Array.from(host.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Ouvrir le prélèvement du mois'),
    );
    expect(link?.getAttribute('href')).toBe('/comptabilite/prelevement-du-mois');
  });

  it('pas encore prélevable : le dit, avec la date', async () => {
    const batches = new FakeBatches();
    batches.view = {
      state: 'not_yet_open',
      floorAt: '2026-11-05T08:00:00.000Z',
      firstClosureAt: '2026-11-30T23:00:00.000Z',
    };
    const { fixture } = await render(new FakeDashboard(), ready(), batches);

    expect(text(fixture)).toContain('le premier mois prélevable se clôt le 1er décembre 2026');
  });

  it('🔴 un aperçu illisible coûte sa phrase, pas la carte', async () => {
    const batches = new FakeBatches();
    batches.view = null;
    const { fixture } = await render(new FakeDashboard(), ready(), batches);

    expect(text(fixture)).toContain('Aperçu du mois illisible.');
    expect(text(fixture)).toContain('Émetteur prêt');
  });
});
