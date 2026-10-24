import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CardInvoiceSignalsView, CollectionProcedureInvoicesView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { procedureInvoices } from '../../__tests__/collection-procedure-fixture';
import { CardInvoicesService } from '../../card-invoices.service';
import { ProcedureInvoicesStep } from './procedure-invoices-step';

const WAITING = {
  orderId: 'o1',
  orderNumber: 'ORD-001',
  companyId: 'c1',
  companyName: 'Hôtel du Port',
  serviceDay: '2026-10-20',
  fulfillmentMethod: 'delivery',
  totalCents: 1_200,
} as const;

function boot(view: CollectionProcedureInvoicesView): ComponentFixture<ProcedureInvoicesStep> {
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
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<ProcedureInvoicesStep>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('l’onglet Factures de la procédure', () => {
  it('les bons à constater passent en premier, comptés en chiffre clé, avec la raison du serveur', () => {
    const fixture = boot(
      procedureInvoices({
        state: 'to_do',
        reason: 'unconfirmed_deliveries',
        missingOrderCount: 3,
        unconfirmedDeliveries: [WAITING],
      }),
    );
    const host = root(fixture);

    expect(host.querySelector('[data-figure-unconfirmed]')?.textContent).toContain('1');
    expect(host.querySelector('[data-figure-missing]')?.textContent).toContain('3');
    expect(host.querySelector('[data-invoices-reason]')?.textContent).toContain(
      '1 bon(s) de la période à constater',
    );
    const order = Array.from(host.querySelectorAll('[data-unconfirmed], app-month-invoices'));
    expect(order[0]?.hasAttribute('data-unconfirmed')).toBe(true);
  });

  it('des bons sans facture : la phrase dit d’émettre, rejouable', () => {
    const fixture = boot(
      procedureInvoices({ state: 'to_do', reason: 'missing_invoices', missingOrderCount: 2 }),
    );
    expect(root(fixture).querySelector('[data-invoices-reason]')?.textContent).toContain(
      '2 bon(s) livré(s) sans facture',
    );
  });

  it('tout facturé : aucune phrase, le cadre de la page dit « Aucune action à mener »', () => {
    const fixture = boot(procedureInvoices());
    expect(root(fixture).querySelector('[data-invoices-reason]')).toBeNull();
    expect(root(fixture).querySelector('[data-unconfirmed]')).toBeNull();
  });
});
