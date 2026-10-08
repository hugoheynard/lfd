import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientInvoices } from '../../../client-invoices.service';
import { bootCard, footButton, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { CREDIT_NOTE, SEPTEMBER } from '../invoice.fixture';
import { InvoicesPanel } from '../invoices-panel/invoices-panel';
import { InvoicesMobileCard } from './invoices-mobile-card';

function render(invoices: readonly IssuedInvoiceSummaryView[]): HTMLElement {
  const fixture = bootCard(
    InvoicesMobileCard,
    [TOMMEUSES],
    [
      {
        provide: ClientInvoices,
        useValue: {
          status: signal('ready'),
          invoices: signal(invoices),
          ensure: (): void => undefined,
          reload: (): Promise<void> => Promise.resolve(),
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

describe('InvoicesMobileCard', () => {
  it('garde l’essentiel — le nombre et la plus récente — et ouvre la liste en bas', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = render([CREDIT_NOTE, SEPTEMBER]);

    expect(el.textContent).toContain('2 factures');
    expect(el.querySelector('[data-invoice="cn_1"]')).not.toBeNull();
    expect(el.querySelector('[data-invoice="inv_1"]')).toBeNull();

    footButton(el).click();
    expect(openedPanel()?.component).toBe(InvoicesPanel);
    expect(openedPanel()?.side).toBe('bottom');
  });

  it('sans facture, le dit et ne propose rien à ouvrir', () => {
    const el = render([]);
    expect(el.querySelector('[data-invoices-none]')).not.toBeNull();
    expect(el.querySelector('app-card-foot')).toBeNull();
  });
});
