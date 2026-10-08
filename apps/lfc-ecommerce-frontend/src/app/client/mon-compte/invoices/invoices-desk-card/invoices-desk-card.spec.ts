import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientInvoices, type InvoicesReadStatus } from '../../../client-invoices.service';
import { FR } from '../../../copy/fr';
import { bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { InvoiceDialog } from '../invoice-dialog/invoice-dialog';
import { CREDIT_NOTE, SEPTEMBER } from '../invoice.fixture';
import { InvoicesDeskCard } from './invoices-desk-card';

let ensured: string[];
let reloads: string[];

function render(
  status: InvoicesReadStatus,
  invoices: readonly IssuedInvoiceSummaryView[],
): HTMLElement {
  ensured = [];
  reloads = [];
  const fixture = bootCard(
    InvoicesDeskCard,
    [TOMMEUSES],
    [
      {
        provide: ClientInvoices,
        useValue: {
          status: signal(status),
          invoices: signal(invoices),
          ensure: (id: string) => ensured.push(id),
          reload: (id: string) => {
            reloads.push(id);
            return Promise.resolve();
          },
        },
      },
    ],
  );
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('InvoicesDeskCard', () => {
  it('lit la liste partagée et montre chaque pièce : numéro, dates, période, TTC', () => {
    const el = render('ready', [CREDIT_NOTE, SEPTEMBER]);

    expect(ensured).toEqual(['cmp_1']);
    expect(el.textContent).toContain('2 factures');
    const row = el.querySelector('[data-invoice="inv_1"]');
    expect(row?.textContent).toContain('Facture FA-2026-000007');
    expect(row?.textContent).toContain('commandes de septembre 2026');
    expect(row?.textContent).toMatch(/105,50\s€/u);
    expect(el.querySelector('[data-invoice="cn_1"]')?.textContent).toContain('Avoir');
  });

  it('un clic ouvre le dialogue de la pièce', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = render('ready', [SEPTEMBER]);

    el.querySelector<HTMLButtonElement>('[data-invoice="inv_1"] button')?.click();

    expect(openedPanel()?.component).toBe(InvoiceDialog);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', invoiceId: 'inv_1' });
  });

  it('sans facture, le dit ; en échec, ne le confond pas avec l’absence et relit au clic', () => {
    expect(render('ready', []).querySelector('[data-invoices-none]')).not.toBeNull();

    const el = render('failed', []);
    expect(el.textContent).toContain(FR.account.invoices.loadFailedTitle);
    expect(el.querySelector('[data-invoices-none]')).toBeNull();
    el.querySelector<HTMLButtonElement>('button')?.click();
    expect(reloads).toEqual(['cmp_1']);
  });
});
