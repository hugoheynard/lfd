import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientInvoices } from '../../../client-invoices.service';
import { matchMediaAt, openedPanel } from '../../account.fixture';
import { InvoiceDialog } from '../invoice-dialog/invoice-dialog';
import { CREDIT_NOTE, SEPTEMBER } from '../invoice.fixture';
import { InvoicesPanel } from './invoices-panel';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('InvoicesPanel', () => {
  it('liste toutes les pièces, et chacune ouvre son dialogue empilé', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InvoicesPanel],
      providers: [
        { provide: FoldPanelRef, useValue: { close: (): void => undefined } },
        {
          provide: ClientInvoices,
          useValue: {
            invoices: signal([CREDIT_NOTE, SEPTEMBER]),
            one: () => new Promise(() => undefined),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(InvoicesPanel);
    fixture.componentRef.setInput('data', { companyId: 'cmp_1' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('[data-invoice]').length).toBe(2);
    el.querySelector<HTMLButtonElement>('[data-invoice="inv_1"] button')?.click();

    expect(openedPanel()?.component).toBe(InvoiceDialog);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', invoiceId: 'inv_1' });
    expect(openedPanel()?.side).toBe('bottom');
  });
});
