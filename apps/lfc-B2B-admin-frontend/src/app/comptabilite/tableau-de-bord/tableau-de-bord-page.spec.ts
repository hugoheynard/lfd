import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { CatalogSummaryView, CustomerPortfolioView, LegalEntityView } from '@lfd/contracts';

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
    creditorAccountLast4: '',
    preNotificationDays: 14,
    archivedAt: null,
    canCollect: false,
    hasLogo: false,
    missingToCollect: ["l'identifiant créancier (ICS)"],
    ...over,
  };
}

class FakeDashboard {
  customersValue = portfolio();
  catalogValue = catalog();
  readonly downloaded: string[] = [];

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

    expect(text(fixture)).toContain("La facturation n'est pas encore construite");
    // Le mot « facture » ne doit jamais côtoyer un nombre sur cet écran.
    expect(text(fixture)).not.toMatch(/\d+\s*factures?\b/u);
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
