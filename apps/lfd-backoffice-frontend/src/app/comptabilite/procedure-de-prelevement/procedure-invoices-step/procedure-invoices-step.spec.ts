import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CardInvoiceSignalsView,
  CollectionProcedureInvoicesView,
  MonthlyClosureView,
  ProcedureOrderView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { procedureInvoices } from '../../__tests__/collection-procedure-fixture';
import { CardInvoicesService } from '../../card-invoices.service';
import { ProcedureInvoicesStep } from './procedure-invoices-step';

const CLOSURE: MonthlyClosureView = {
  periodClosesAt: '2026-10-31T23:00:00.000Z',
  periodStartsAt: '2026-09-30T22:00:00.000Z',
  periodLabel: 'du 1er au 31 octobre 2026',
  modes: ['monthly'],
  issuableFrom: '2026-10-31T22:55:00.000Z',
  reached: true,
  floorAt: '2026-01-01T00:00:00.000Z',
  open: true,
  invoices: [],
  signaled: [],
  autopilotRun: null,
  batches: [],
};

function order(
  orderId: string,
  status: ProcedureOrderView['status'],
  over: Partial<ProcedureOrderView> = {},
): ProcedureOrderView {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    companyName: 'Hôtel du Port',
    serviceDay: '2026-10-20',
    fulfillmentMethod: 'delivery',
    totalCents: 1_200,
    status,
    invoiceNumber: null,
    deliveryDayMissing: false,
    ...over,
  };
}

const MIXED = procedureInvoices({
  state: 'to_do',
  reason: 'receipts_to_confirm',
  orders: [
    order('a', 'invoiced', { invoiceNumber: 'FA-LFD-2026-000001' }),
    order('b', 'receipt_confirmed'),
    order('c', 'receipt_confirmed', { deliveryDayMissing: true }),
    order('d', 'receipt_to_confirm'),
  ],
  figures: { invoiced: 1, receiptConfirmed: 2, receiptToConfirm: 1 },
  issuableCount: 1,
  closure: CLOSURE,
});

function boot(
  view: CollectionProcedureInvoicesView,
  canWrite = true,
): { fixture: ComponentFixture<ProcedureInvoicesStep>; issued: string[] } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: CardInvoicesService,
        useValue: {
          signals: (): Promise<CardInvoiceSignalsView> => Promise.resolve({ signaled: [] }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProcedureInvoicesStep);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('canWrite', canWrite);
  const issued: string[] = [];
  fixture.componentInstance.issue.subscribe((closesAt) => issued.push(closesAt));
  fixture.detectChanges();
  return { fixture, issued };
}

const root = (fixture: ComponentFixture<ProcedureInvoicesStep>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const statuses = (host: HTMLElement): (string | null)[] =>
  Array.from(host.querySelectorAll('[data-order-status]')).map((cell) =>
    cell.getAttribute('data-order-status'),
  );

describe('l’onglet Factures de la procédure', () => {
  it('une phrase d’état unique, au vocabulaire des statuts', () => {
    const { fixture } = boot(MIXED);
    expect(root(fixture).querySelector('[data-invoices-reason]')?.textContent?.trim()).toBe(
      '1 facturée, 2 réceptions confirmées à facturer, 1 réception à confirmer.',
    );
  });

  it('tout facturé : la phrase le dit, sans bouton', () => {
    const { fixture } = boot(
      procedureInvoices({
        orders: [order('a', 'invoiced', { invoiceNumber: 'FA-LFD-2026-000001' })],
        figures: { invoiced: 1, receiptConfirmed: 0, receiptToConfirm: 0 },
        closure: CLOSURE,
      }),
    );
    const host = root(fixture);
    expect(host.querySelector('[data-invoices-reason]')?.textContent).toContain(
      'Toutes les commandes de la période sont facturées.',
    );
    expect(host.querySelector('[data-issue-invoices]')).toBeNull();
    expect(host.querySelector('[data-order-invoice]')?.textContent).toContain('FA-LFD-2026-000001');
  });

  it('un statut par ligne ; le jour manquant est nommé ; seule la réception à confirmer porte le geste', () => {
    const { fixture } = boot(MIXED);
    const host = root(fixture);
    expect(statuses(host)).toEqual([
      'invoiced',
      'receipt_confirmed',
      'receipt_confirmed',
      'receipt_to_confirm',
    ]);
    expect(host.querySelectorAll('[data-order-day-missing]')).toHaveLength(1);
    expect(host.querySelector('[data-order-day-missing]')?.textContent).toContain(
      'date de réception manquante — à reprendre',
    );
    const gestures = host.querySelectorAll('[data-confirm-receipt]');
    expect(gestures).toHaveLength(1);
    expect(gestures[0]?.getAttribute('data-confirm-receipt')).toBe('d');
    expect(gestures[0]?.textContent).toContain('Confirmer la réception');
  });

  it('les chiffres clés filtrent la liste, et un second clic la rend entière', () => {
    const { fixture } = boot(MIXED);
    const host = root(fixture);
    const figure = host.querySelector<HTMLButtonElement>('[data-figure="receipt_confirmed"]');
    expect(figure?.textContent).toContain('2');
    expect(figure?.textContent).toContain('Réceptions confirmées à facturer');

    figure?.click();
    fixture.detectChanges();
    expect(statuses(host)).toEqual(['receipt_confirmed', 'receipt_confirmed']);
    expect(figure?.getAttribute('aria-pressed')).toBe('true');

    figure?.click();
    fixture.detectChanges();
    expect(statuses(host)).toHaveLength(4);
  });

  it('« Émettre les factures des réceptions confirmées (N) » émet la clôture', () => {
    const { fixture, issued } = boot(MIXED);
    const button = root(fixture).querySelector<HTMLButtonElement>('[data-issue-invoices]');
    expect(button?.textContent).toContain('Émettre les factures des réceptions confirmées (1)');

    button?.click();

    expect(issued).toEqual([CLOSURE.periodClosesAt]);
  });

  it('pas de bouton à N = 0, même avec des réceptions confirmées sans jour de réception', () => {
    const { fixture } = boot({ ...MIXED, issuableCount: 0 });
    expect(root(fixture).querySelector('[data-issue-invoices]')).toBeNull();
  });

  it('pas de bouton avant l’heure d’émission, avant la mise en service, ni sans le droit d’écrire', () => {
    expect(
      root(boot({ ...MIXED, closure: { ...CLOSURE, reached: false } }).fixture).querySelector(
        '[data-issue-invoices]',
      ),
    ).toBeNull();
    expect(
      root(boot({ ...MIXED, closure: { ...CLOSURE, open: false } }).fixture).querySelector(
        '[data-issue-invoices]',
      ),
    ).toBeNull();
    expect(root(boot(MIXED, false).fixture).querySelector('[data-issue-invoices]')).toBeNull();
  });
});
