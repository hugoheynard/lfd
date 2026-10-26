import { vi } from 'vitest';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type {
  AccountBankExportsView,
  CardInvoiceSignalsView,
  CollectionCycleView,
  IssueMonthlyInvoicesPayload,
  MonthlyInvoiceReportView,
  CollectionProcedureView,
  LegalEntityView,
  MandateBankExportsView,
  StaffPermission,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import {
  procedureBatch,
  procedureInvoices,
  procedureView,
} from '../__tests__/collection-procedure-fixture';
import { CardInvoicesService } from '../card-invoices.service';
import { MonthlyInvoicesService } from '../monthly-invoices.service';
import { AccountBankExportsService } from '../account-bank-exports.service';
import { CollectionBatchesService } from '../collection-batches.service';
import { CollectionProcedureService, type ProcedureAddress } from '../collection-procedure.service';
import { AccountBankExportCard } from '../entites-juridiques/detail/account-bank-export-card/account-bank-export-card';
import { LegalEntitiesService } from '../legal-entities.service';
import { MandateBankExportsService } from '../mandate-bank-exports.service';
import { ProcedureDePrelevementPage } from './procedure-de-prelevement-page';
import { ProcedureInvoicesStep } from './procedure-invoices-step/procedure-invoices-step';

/**
 * Ce que la page tient : le titre dit le lot suivi, l'onglet ouvert à
 * l'arrivée est celui que le serveur désigne, un onglet verrouillé dit
 * pourquoi et mène à l'onglet qui le débloque (Q6), un onglet fait dit
 * « Aucune action à mener » avec « Suivant », et un geste d'une carte relit
 * l'état sans changer d'onglet.
 */

const ENTITY: Partial<LegalEntityView> = {
  id: 'le1',
  name: 'La Folie Douce',
  siren: '552100554',
  ics: 'FR72ZZZ123456',
  archivedAt: null,
  nextCollection: {
    closesAt: '2026-10-31T23:00:00.000Z',
    plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
    collectionDay: '2026-11-16',
    depositDeadline: null,
    tightDepositMargin: null,
  },
};

const ACCOUNTS: AccountBankExportsView = {
  debitedCount: 0,
  toExport: [],
  inFlightCount: 0,
  knownCount: 0,
  maxPerExport: 200,
  excluded: [],
  accounts: [],
  exports: [],
};

const MANDATES: MandateBankExportsView = {
  exportableCount: 2,
  toExportCount: 2,
  inFlightCount: 0,
  importedCount: 0,
  excluded: [],
  mandates: [],
  exports: [],
};

class FakeProcedure {
  view: CollectionProcedureView = procedureView();
  reads = 0;
  readonly asked: { readonly address: ProcedureAddress; readonly batchId: string | null }[] = [];
  read(address: ProcedureAddress, batchId: string | null): Promise<CollectionProcedureView> {
    this.reads += 1;
    this.asked.push({ address, batchId });
    return Promise.resolve(this.view);
  }
}

/** L'adresse du détail : la procédure d'octobre, sur le lot `b1`. */
function routeOf(queryParams: Readonly<Record<string, string>>) {
  return {
    snapshot: {
      paramMap: convertToParamMap({ id: 'le1~2026-11-01' }),
      queryParamMap: convertToParamMap(queryParams),
    },
  };
}

/** L'émission des factures : rejouable, elle rend un compte rendu vide. */
class FakeInvoices {
  readonly issued: IssueMonthlyInvoicesPayload[] = [];
  issue(payload: IssueMonthlyInvoicesPayload): Promise<MonthlyInvoiceReportView> {
    this.issued.push(payload);
    return Promise.resolve({
      periodClosesAt: payload.periodClosesAt,
      periodStartsAt: '2026-09-30T22:00:00.000Z',
      periodLabel: 'du 1er au 31 octobre 2026',
      issued: [],
      blocked: [],
      alreadyInvoiced: 0,
      unbillableOrders: 0,
    });
  }
}

let procedure: FakeProcedure;
let invoices: FakeInvoices;

async function render(
  queryParams: Readonly<Record<string, string>> = { lot: 'b1' },
): Promise<ComponentFixture<ProcedureDePrelevementPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProcedureDePrelevementPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: routeOf(queryParams) },
      { provide: CollectionProcedureService, useValue: procedure },
      {
        provide: CollectionBatchesService,
        useValue: {
          cycle: (): Promise<CollectionCycleView> =>
            Promise.resolve({ batches: [], exclusions: [] }),
          preview: (): Promise<never> => Promise.reject(new Error('aperçu hors sujet ici')),
        },
      },
      { provide: MonthlyInvoicesService, useValue: invoices },
      {
        provide: CardInvoicesService,
        useValue: {
          signals: (): Promise<CardInvoiceSignalsView> => Promise.resolve({ signaled: [] }),
        },
      },
      {
        provide: LegalEntitiesService,
        useValue: {
          list: (): Promise<readonly Partial<LegalEntityView>[]> => Promise.resolve([ENTITY]),
        },
      },
      { provide: AccountBankExportsService, useValue: { of: () => Promise.resolve(ACCOUNTS) } },
      { provide: MandateBankExportsService, useValue: { of: () => Promise.resolve(MANDATES) } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => p === 'b2b_accounting:read' },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ProcedureDePrelevementPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<ProcedureDePrelevementPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function query(fixture: ComponentFixture<ProcedureDePrelevementPage>, selector: string) {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
}

function click(fixture: ComponentFixture<ProcedureDePrelevementPage>, selector: string): void {
  const node = query(fixture, `${selector} button`) ?? query(fixture, selector);
  node?.click();
  fixture.detectChanges();
}

beforeEach(() => {
  procedure = new FakeProcedure();
  invoices = new FakeInvoices();
});

describe('la page « Procédure de prélèvement »', () => {
  it('le titre dit le code de la procédure, le rythme et la période du lot suivi', async () => {
    const fixture = await render();
    expect(text(fixture)).toContain(
      'Procédure de prélèvement PRL-261101-M — Mensuel — période du 1er au 31 octobre 2026',
    );
  });

  it('sans lot ouvert : le seul nom de la page, et la prochaine clôture', async () => {
    procedure.view = procedureView({ followed: null, openBatches: [] });
    const fixture = await render();
    expect(text(fixture)).not.toContain('PRL-261101-M —');
    expect(text(fixture)).toContain('Procédure de prélèvement PRL-261101-M');
    expect(text(fixture)).toContain('Prochaine clôture le');
  });

  it('ouvre l’onglet que le serveur désigne, et un onglet fait dit « Aucune action à mener »', async () => {
    procedure.view = procedureView({ arrivalStep: 'accounts' });
    const fixture = await render();
    expect(text(fixture)).toContain('Aucune action à mener');

    click(fixture, '[data-next]');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-nothing-to-do]')).toBeNull();
  });

  it('`?onglet=comptes` ouvre l’onglet Comptes, même si le serveur désigne Mandats', async () => {
    procedure.view = procedureView({ arrivalStep: 'mandates' });
    const fixture = await render({ onglet: 'comptes' });

    expect(fixture.debugElement.query(By.directive(AccountBankExportCard))).not.toBeNull();
  });

  it('un `?onglet=` inconnu laisse le serveur choisir', async () => {
    procedure.view = procedureView({ arrivalStep: 'mandates' });
    const fixture = await render({ onglet: 'inconnu' });

    expect(fixture.debugElement.query(By.directive(AccountBankExportCard))).toBeNull();
  });

  it('un onglet verrouillé reste lisible : il dit pourquoi et mène à l’onglet qui le débloque', async () => {
    procedure.view = procedureView({
      accounts: { state: 'to_do', toExportCount: 1, inFlightCount: 0, excludedCount: 0 },
      mandates: { state: 'locked', toExportCount: 2, awaitingImport: false, excludedCount: 0 },
      arrivalStep: 'mandates',
    });
    const fixture = await render();
    expect(query(fixture, '[data-locked]')?.textContent).toContain('Importer d’abord les comptes');

    click(fixture, '[data-locked]');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(AccountBankExportCard))).not.toBeNull();
  });

  it('un geste d’une carte relit l’état sans changer d’onglet', async () => {
    procedure.view = procedureView({ arrivalStep: 'accounts' });
    const fixture = await render();
    const before = procedure.reads;

    const card = fixture.debugElement.query(By.directive(AccountBankExportCard));
    (card.componentInstance as AccountBankExportCard).changed.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(procedure.reads).toBe(before + 1);
    expect(fixture.debugElement.query(By.directive(AccountBankExportCard))).not.toBeNull();
  });

  it('ne liste plus les lots ouverts en tête : la table des procédures fait ce choix', async () => {
    const core = procedureBatch({ id: 'b2', scheme: 'CORE', payerModes: ['weekly'] });
    procedure.view = procedureView({ openBatches: [procedureBatch(), core] });
    const fixture = await render();
    expect(query(fixture, '[data-open-batches]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Suivre');
  });

  it('une clôture mutualisée : un encadré dit les rythmes réunis et leurs clients', async () => {
    procedure.view = procedureView({
      procedure: {
        code: 'PRL-261102-HM',
        closureDay: '2026-11-02',
        closureModes: ['monthly', 'weekly'],
        payerCounts: [
          { mode: 'monthly', count: 12 },
          { mode: 'weekly', count: 3 },
        ],
      },
    });
    const fixture = await render();
    const callout = query(fixture, '[data-pooled]')?.textContent ?? '';
    expect(callout).toContain('hebdomadaire + mensuel : une seule clôture, un seul lot');
    expect(callout).toContain('3 hebdomadaires, 12 mensuels');
  });

  it('une clôture d’un seul rythme : pas d’encadré de mutualisation', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-pooled]')).toBeNull();
  });

  it('lit la procédure de l’adresse, sur le lot de l’adresse', async () => {
    await render();
    expect(procedure.asked[0]).toEqual({
      address: { procedureId: 'le1~2026-11-01' },
      batchId: 'b1',
    });
  });

  it('une clôture manquée : le dit, et ouvre la dernière clôture dont le lot la reprend', async () => {
    procedure.view = procedureView({
      followed: null,
      openBatches: [],
      missed: {
        closesAt: '2026-08-31T22:00:00.000Z',
        periodLabel: 'du 1er au 31 août 2026',
        latestProcedureId: 'le1~2026-10-01',
        latestPeriodLabel: 'du 1er au 30 septembre 2026',
      },
    });
    const fixture = await render();
    const router = TestBed.inject(Router);
    router.navigate = (): Promise<boolean> => Promise.resolve(true);
    const callout = query(fixture, '[data-missed]')?.textContent ?? '';
    expect(callout).toContain('la période du 1er au 31 août 2026 n’a jamais été préparée');
    expect(callout).toContain('période du 1er au 30 septembre 2026');

    click(fixture, '[data-open-latest]');
    // Le geste enchaîne navigation puis relecture : on attend la relecture.
    await vi.waitFor(() =>
      expect(procedure.asked.at(-1)).toEqual({
        address: { procedureId: 'le1~2026-10-01' },
        batchId: null,
      }),
    );
  });

  it('sans clôture manquée : aucun avertissement de clôture manquée', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-missed]')).toBeNull();
  });

  it('« ← Toutes les procédures » ramène à la table', async () => {
    const fixture = await render();
    const back = query(fixture, '[data-back-to-list] a') ?? query(fixture, '[data-back-to-list]');
    expect(back?.textContent).toContain('Toutes les procédures');
    expect(back?.getAttribute('href')).toBe('/comptabilite/procedure-de-prelevement');
  });

  it('« 3 Factures » est entre les mandats et le fichier ; `?onglet=factures` l’ouvre', async () => {
    const fixture = await render({ onglet: 'factures' });
    expect(text(fixture)).toContain('3 Factures');
    expect(text(fixture)).toContain('4 Fichier de prélèvement');
    expect(text(fixture)).toContain('5 Retours de la banque');
    expect(query(fixture, 'app-procedure-invoices-step')).not.toBeNull();
  });

  it('l’onglet Factures liste les commandes de la période, chacune avec son statut', async () => {
    procedure.view = procedureView({
      arrivalStep: 'invoices',
      invoices: procedureInvoices({
        state: 'to_do',
        reason: 'receipts_to_confirm',
        orders: [
          {
            orderId: 'o1',
            orderNumber: 'ORD-001',
            companyName: 'Hôtel du Port',
            serviceDay: '2026-10-20',
            fulfillmentMethod: 'pickup',
            totalCents: 1_200,
            status: 'receipt_to_confirm',
            invoiceNumber: null,
            remainderPlannedOn: null,
          },
        ],
        figures: { invoiced: 0, receiptConfirmed: 0, receiptToConfirm: 1, awaitingRemainder: 0 },
      }),
    });
    const fixture = await render();

    expect(query(fixture, '[data-procedure-orders]')?.textContent).toContain('ORD-001');
    expect(query(fixture, '[data-figure="receipt_to_confirm"]')?.textContent).toContain('1');
    expect(query(fixture, '[data-invoices-reason="receipts_to_confirm"]')).not.toBeNull();
  });

  it('« Émettre » envoie la clôture de la procédure, puis relit l’état', async () => {
    procedure.view = procedureView({ arrivalStep: 'invoices' });
    const fixture = await render();
    const reads = procedure.reads;
    const step = fixture.debugElement.query(By.css('app-procedure-invoices-step'));

    (step.componentInstance as ProcedureInvoicesStep).issue.emit('2026-10-31T23:00:00.000Z');
    await fixture.whenStable();

    expect(invoices.issued).toEqual([
      { legalEntityId: 'le1', periodClosesAt: '2026-10-31T23:00:00.000Z' },
    ]);
    expect(procedure.reads).toBeGreaterThan(reads);
  });

  it('verrouillé (clôture à venir) : il dit pourquoi, sans onglet à ouvrir, et garde les réceptions à confirmer', async () => {
    procedure.view = procedureView({
      arrivalStep: 'invoices',
      invoices: procedureInvoices({ state: 'locked', reason: 'not_yet_issuable' }),
    });
    const fixture = await render();

    expect(query(fixture, '[data-locked]')?.textContent).toContain('23 h 55');
    expect(query(fixture, '[data-locked] button')).toBeNull();
    expect(query(fixture, 'app-procedure-invoices-step')).not.toBeNull();
  });
});
