import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SectionTitle } from '@lfd/b2b-ui/order';
import type {
  IssuedInvoiceSummaryView,
  OrderMailView,
  StaffNote,
  StaffPermission,
} from '@lfd/contracts';
import { NgTemplateOutlet } from '@angular/common';
import { FoldButtonComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { IssuedInvoicesService } from '../../comptabilite/issued-invoices.service';
import { PdfPrinter } from '../../shared/print-pdf/pdf-printer';
import { adminOrder } from '../__tests__/admin-order-fixture';
import { DeliveryNotesService } from '../delivery-notes.service';
import { DocumentRow } from '../document-row/document-row';
import { OrderDeliveryNotesCard } from '../order-delivery-notes-card/order-delivery-notes-card';
import { OrderInvoicesCard } from '../order-invoices-card/order-invoices-card';
import { OrderMailsCard } from '../order-mails-card/order-mails-card';
import { OrderMailsStore } from '../order-mails.store';
import { AdminOrdersService } from '../orders.service';
import { OrderDocumentsPanel } from './order-documents-panel';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const NOTE: StaffNote = {
  audience: 'staff',
  number: 'BL-9-1',
  orderId: 'ord_9',
  orderReference: 'ORD-9',
  orderPlacedAt: '2026-09-07T06:00:00.000Z',
  requestedFor: '2026-09-08',
  receivedOn: null,
  customer: { tradeName: 'Trois Ponts', legalName: 'SARL Trois Ponts' },
  fulfillment: {
    method: 'pickup',
    address: null,
    pickupLabel: null,
    window: null,
    contact: null,
    signatureRequired: false,
  },
  note: '',
  issuedAt: '2026-09-08T07:00:00.000Z',
  variant: 'pro',
  customerPhone: null,
  lines: [],
  money: null,
  status: 'prepared',
  plannedAt: '2026-09-07T20:00:00.000Z',
  preparedAt: '2026-09-08T06:00:00.000Z',
  handedOverAt: null,
  voidedAt: null,
  reprintNeeded: false,
};

const INVOICE: IssuedInvoiceSummaryView = {
  invoiceId: 'inv_1',
  number: 'FA-LFD-2026-000007',
  kind: 'invoice',
  correctedInvoiceNumber: null,
  issuedOn: '2026-09-30',
  dueOn: '2026-09-30',
  period: null,
  periodClosesAt: null,
  periodLabel: null,
  totalHtCents: 1_000,
  totalVatCents: 55,
  totalTtcCents: 1_055,
  documentAvailable: true,
};

const MAIL: OrderMailView = {
  id: 'ms_1',
  template: 'customer.order-placed',
  requestedAt: '2030-01-09T09:00:00.000Z',
  state: 'accepted',
  delivery: 'dry_run',
  deliveryAt: null,
};

const PDF = new Blob(['%PDF-1.3'], { type: 'application/pdf' });

async function render() {
  const printer = { print: vi.fn(), download: vi.fn() };
  const sheetPdf = vi.fn(async () => PDF);
  const permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'mail_sends:read'];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      OrderMailsStore,
      { provide: PdfPrinter, useValue: printer },
      {
        provide: AdminOrdersService,
        useValue: { sheetPdf, mails: async () => ({ items: [MAIL] }) },
      },
      {
        provide: DeliveryNotesService,
        useValue: { ofOrder: async () => [NOTE], carrierPdf: async () => PDF },
      },
      {
        provide: IssuedInvoicesService,
        useValue: { ofOrder: async () => ({ invoices: [INVOICE] }), document: async () => PDF },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  // Les CGV et la preuve ont leurs propres specs : ici, seule leur PLACE compte.
  TestBed.overrideComponent(OrderDocumentsPanel, {
    set: {
      imports: [
        DocumentRow,
        FoldButtonComponent,
        NgTemplateOutlet,
        OrderDeliveryNotesCard,
        OrderInvoicesCard,
        OrderMailsCard,
        SectionTitle,
      ],
      schemas: [NO_ERRORS_SCHEMA],
    },
  });
  const fixture = TestBed.createComponent(OrderDocumentsPanel);
  fixture.componentRef.setInput('order', adminOrder());
  fixture.detectChanges();
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { el: fixture.nativeElement as HTMLElement, printer, sheetPdf };
}

const group = (el: HTMLElement, key: string) => el.querySelector(`[data-doc-group="${key}"]`);

describe('OrderDocumentsPanel — l’onglet « Documents »', () => {
  it('range les pièces, les envois, les conditions et la preuve, chacun sous son titre', async () => {
    const { el } = await render();
    const pieces = group(el, 'pieces');
    expect(pieces?.querySelector('lfd-section-title')?.textContent).toContain('Pièces');
    const titles = [...(pieces?.querySelectorAll('[data-doc-row]') ?? [])].map((row) =>
      row.querySelector('.dr-title')?.textContent?.trim(),
    );
    expect(titles).toEqual([
      'Confirmation de commande',
      'Bon de livraison BL-9-1',
      'FA-LFD-2026-000007',
      'Facture',
    ]);
    expect(group(el, 'sends')?.querySelectorAll('[data-doc-row]')).toHaveLength(1);
    expect(group(el, 'terms')?.querySelector('app-order-sales-terms-card')).not.toBeNull();
    expect(group(el, 'proof')?.querySelector('app-handover-proof-card')).not.toBeNull();
  });

  it('chaque pièce disponible a « Télécharger » et « Imprimer » ; l’indisponible dit pourquoi, sans bouton', async () => {
    const { el } = await render();
    const rows = [...(group(el, 'pieces')?.querySelectorAll('[data-doc-row]') ?? [])];
    const available = rows.slice(0, 3);
    for (const row of available) {
      expect(row.querySelector('[data-doc-download]')?.textContent).toContain('Télécharger');
      expect(row.querySelector('[data-doc-print]')?.textContent).toContain('Imprimer');
    }
    const invoicePlaceholder = rows[3];
    expect(invoicePlaceholder?.querySelector('button')).toBeNull();
    expect(invoicePlaceholder?.querySelector('[data-doc-meta]')?.textContent).toContain(
      'facture du mois',
    );
  });

  it('« Imprimer » passe par la brique partagée', async () => {
    const { el, printer, sheetPdf } = await render();
    el.querySelector<HTMLButtonElement>(
      '[data-order-document="order-sheet"] [data-doc-print]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sheetPdf).toHaveBeenCalledWith('ord_9');
    expect(printer.print).toHaveBeenCalledWith(PDF);
    expect(printer.download).not.toHaveBeenCalled();
  });

  it('l’e-mail dit son étape, en mots simples', async () => {
    const { el } = await render();
    const status = group(el, 'sends')?.querySelector('[data-order-mail-status]');
    expect(status?.textContent).toContain('Non envoyé — mode dev');
    expect(el.textContent).not.toMatch(/Resend|à blanc/u);
  });
});
