import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BillingCycleView,
  CatalogSummaryView,
  CustomerPortfolioView,
  LegalEntityView,
  SepaScheme,
} from '@lfd/contracts';

import { ComptabiliteDashboardService, type NamedBlob } from '../comptabilite-dashboard.service';
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
    mandateContractDescription: '',
    mandatePaymentType: 'recurrent',
    mandateScheme: 'B2B',
    archivedAt: null,
    canCollect: false,
    hasLogo: false,
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
  /** Le nom que le serveur rend dans `Content-Disposition` ; `null` = en-tête absent. */
  draftFileName: ((scheme: SepaScheme) => string) | null = (scheme) =>
    `BROUILLON-prelevement-${scheme}-552100554-2026-09.xml`;
  cycleDraftAudit(legalEntityId: string, scheme: SepaScheme): Promise<NamedBlob> {
    this.downloaded.push(`controle:${legalEntityId}:${scheme}`);
    return Promise.resolve({
      blob: new Blob(['Référence']),
      fileName: this.draftFileName === null ? null : `CONTROLE-${this.draftFileName(scheme)}`,
    });
  }
  cycleDraft(legalEntityId: string, scheme: SepaScheme): Promise<NamedBlob> {
    this.downloaded.push(`brouillon:${legalEntityId}:${scheme}`);
    return Promise.resolve({
      blob: new Blob(['<Document/>']),
      fileName: this.draftFileName === null ? null : this.draftFileName(scheme),
    });
  }
}

class FakeEntities {
  rows: readonly LegalEntityView[] = [entity()];
  list(): Promise<readonly LegalEntityView[]> {
    return Promise.resolve(this.rows);
  }
}

async function render(
  api = new FakeDashboard(),
  entities = new FakeEntities(),
): Promise<{ fixture: ComponentFixture<TableauDeBordPage>; api: FakeDashboard }> {
  TestBed.configureTestingModule({
    imports: [TableauDeBordPage],
    providers: [
      // Les cartes portent des `routerLink` vers les écrans voisins ; sans
      // routeur, c'est `ActivatedRoute` qui manque, et la page ne rend rien.
      provideRouter([]),
      { provide: ComptabiliteDashboardService, useValue: api },
      { provide: LegalEntitiesService, useValue: entities },
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
  it('🔴 ne montre AUCUN chiffre de facturation — il dit que la brique manque', async () => {
    const { fixture } = await render();

    // La carte dit désormais une DÉCISION, plus une attente : nous n'émettons
    // pas de factures, le comptable les sort de nos commandes (2026-09-10).
    expect(text(fixture)).toContain("Nous n'émettons pas de factures");
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

describe('TableauDeBordPage — les brouillons du lot, un par schéma', () => {
  const ready = (): FakeEntities => {
    const entities = new FakeEntities();
    entities.rows = [entity({ ics: 'FR72ZZZ123456', canCollect: true, missingToCollect: [] })];
    return entities;
  };

  /** Les noms sous lesquels le navigateur a reçu les fichiers. */
  function captureSaves(): string[] {
    const names: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:brouillon');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    return names;
  }

  const draftButtons = (fixture: ComponentFixture<TableauDeBordPage>): HTMLButtonElement[] => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button.tb-draft',
    ),
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const auditButtons = (fixture: ComponentFixture<TableauDeBordPage>): HTMLButtonElement[] => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button.tb-audit',
    ),
  ];

  it('propose deux lots, CORE puis interentreprises, chacun avec son contrôle', async () => {
    const { fixture } = await render(new FakeDashboard(), ready());

    expect(draftButtons(fixture).map((b) => b.textContent?.trim())).toEqual([
      'Brouillon CORE',
      'Brouillon interentreprises',
    ]);
    expect(auditButtons(fixture).map((b) => b.textContent?.trim())).toEqual([
      'Contrôler CORE en CSV',
      'Contrôler interentreprises en CSV',
    ]);
  });

  it('le contrôle suit le schéma, et le nom du serveur — ou son repli suffixé', async () => {
    const names = captureSaves();
    const api = new FakeDashboard();
    const { fixture } = await render(api, ready());

    auditButtons(fixture)[0]?.click();
    await fixture.whenStable();
    api.draftFileName = null;
    auditButtons(fixture)[1]?.click();
    await fixture.whenStable();

    expect(api.downloaded).toEqual(['controle:le1:CORE', 'controle:le1:B2B']);
    expect(names).toEqual([
      'CONTROLE-BROUILLON-prelevement-CORE-552100554-2026-09.xml',
      'CONTROLE-prelevement-552100554-B2B.csv',
    ]);
  });

  it('demande chaque fichier avec son schéma, et l’enregistre sous le nom du serveur', async () => {
    const names = captureSaves();
    const { fixture, api } = await render(new FakeDashboard(), ready());

    draftButtons(fixture)[0]?.click();
    await fixture.whenStable();
    draftButtons(fixture)[1]?.click();
    await fixture.whenStable();

    expect(api.downloaded).toEqual(['brouillon:le1:CORE', 'brouillon:le1:B2B']);
    expect(names).toEqual([
      'BROUILLON-prelevement-CORE-552100554-2026-09.xml',
      'BROUILLON-prelevement-B2B-552100554-2026-09.xml',
    ]);
  });

  it('sans `Content-Disposition`, retombe sur un nom suffixé du schéma', async () => {
    const names = captureSaves();
    const api = new FakeDashboard();
    api.draftFileName = null;
    const { fixture } = await render(api, ready());

    draftButtons(fixture)[1]?.click();
    await fixture.whenStable();

    expect(names).toEqual(['BROUILLON-prelevement-552100554-B2B.xml']);
  });
});
