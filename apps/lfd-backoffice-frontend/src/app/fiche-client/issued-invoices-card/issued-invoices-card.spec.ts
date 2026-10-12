import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { IssuedInvoicesService } from '../../comptabilite/issued-invoices.service';
import { NotifyService } from '../../notify.service';
import { IssuedInvoicesCard } from './issued-invoices-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const INVOICE: IssuedInvoiceSummaryView = {
  invoiceId: 'inv_1',
  number: 'FA-2026-000007',
  kind: 'invoice',
  correctedInvoiceNumber: null,
  issuedOn: '2026-09-30',
  dueOn: '2026-10-15',
  period: '2026-09',
  periodClosesAt: '2026-09-30T22:00:00.000Z',
  periodLabel: 'du 1er au 30 septembre 2026',
  totalHtCents: 10_000,
  totalVatCents: 550,
  totalTtcCents: 10_550,
  documentAvailable: false,
};

const pdfAsked: string[] = [];

async function boot(
  read: () => Promise<{ invoices: readonly IssuedInvoiceSummaryView[] }>,
  billedBy: string | null = null,
): Promise<ComponentFixture<IssuedInvoicesCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: IssuedInvoicesService,
        useValue: {
          ofCompany: read,
          document: (invoiceId: string) => {
            pdfAsked.push(invoiceId);
            return Promise.resolve(new Blob(['%PDF-']));
          },
        },
      },
      { provide: NotifyService, useValue: { error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(IssuedInvoicesCard);
  fixture.componentRef.setInput('companyId', 'c1');
  fixture.componentRef.setInput('billedBy', billedBy);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('IssuedInvoicesCard', () => {
  it('liste factures et avoirs, chacun lié à sa pièce, avec période, échéance et TTC', async () => {
    const credit: IssuedInvoiceSummaryView = {
      ...INVOICE,
      invoiceId: 'cn_1',
      number: 'FA-2026-000009',
      kind: 'credit_note',
      correctedInvoiceNumber: 'FA-2026-000007',
      dueOn: null,
      period: null,
    };
    const host = (await boot(() => Promise.resolve({ invoices: [credit, INVOICE] })))
      .nativeElement as HTMLElement;

    const row = host.querySelector('[data-issued-invoice="inv_1"]');
    expect(row?.querySelector('a')?.getAttribute('href')).toBe('/comptabilite/factures/inv_1');
    expect(row?.textContent).toContain('septembre 2026');
    expect(row?.textContent).toMatch(/105,50/u);
    expect(host.querySelector('[data-issued-invoice="cn_1"]')?.textContent).toContain(
      'corrige FA-2026-000007',
    );
  });

  it('sans facture, un site dit chez qui il est facturé', async () => {
    const host = (await boot(() => Promise.resolve({ invoices: [] }), 'Groupe Col Pers'))
      .nativeElement as HTMLElement;
    expect(host.querySelector('[data-issued-invoices-empty]')?.textContent).toContain(
      'facturé sur la facture de Groupe Col Pers',
    );
  });

  /**
   * Régression : la phrase des sites s'affichait sur toutes les fiches,
   * sous-compte ou non (Hugo, 2026-10-12).
   */
  it('sans facture, un compte qui n’est pas un site ne parle pas de principal', async () => {
    const host = (await boot(() => Promise.resolve({ invoices: [] }))).nativeElement as HTMLElement;
    const empty = host.querySelector('[data-issued-invoices-empty]')?.textContent ?? '';
    expect(empty).toContain('Aucune facture adressée à ce compte');
    expect(empty).not.toContain('principal');
  });

  it('dit l’échec de lecture sans inventer une liste vide', async () => {
    const host = (await boot(() => Promise.reject(new Error('réseau'))))
      .nativeElement as HTMLElement;
    expect(host.querySelector('[data-issued-invoices-error]')).not.toBeNull();
    expect(host.querySelector('[data-issued-invoices]')).toBeNull();
  });

  it('un PDF rendu se télécharge depuis sa ligne, sous le numéro ; pas de bouton sinon', async () => {
    pdfAsked.splice(0);
    const saved: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:facture');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    const pending = { ...INVOICE, invoiceId: 'inv_0', number: 'FA-2026-000006' };
    const rendered = { ...INVOICE, documentAvailable: true };
    const host = (await boot(() => Promise.resolve({ invoices: [rendered, pending] })))
      .nativeElement as HTMLElement;

    expect(
      host.querySelector('[data-issued-invoice="inv_0"] [data-issued-invoice-pdf]'),
    ).toBeNull();
    (
      host.querySelector(
        '[data-issued-invoice="inv_1"] [data-issued-invoice-pdf]',
      ) as HTMLButtonElement
    ).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pdfAsked).toEqual(['inv_1']);
    expect(saved).toEqual(['FA-2026-000007.pdf']);
    vi.restoreAllMocks();
  });
});
