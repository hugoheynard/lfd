import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { IssuedInvoiceView } from '@lfd/contracts';

import { IssuedInvoicesService } from '../issued-invoices.service';
import { FactureEmisePage } from './facture-emise-page';

/**
 * Ce que ces cas tiennent (plan `plan-emission-de-la-facture.md`, E6) : la
 * pièce émise se relit telle que figée — parties, lignes, ventilation,
 * mentions, règlement, bons ; inconnue, elle ne se confond pas avec une panne.
 * Les dates ne sont qu'affichées.
 */
function issuedInvoice(over: Partial<IssuedInvoiceView> = {}): IssuedInvoiceView {
  return {
    invoiceId: 'inv_1',
    number: 'FA-2026-000007',
    kind: 'invoice',
    correctedInvoiceNumber: null,
    issuedOn: '2026-09-30',
    dueOn: '2026-10-15',
    period: '2026-09',
    totalHtCents: 10_000,
    totalVatCents: 550,
    totalTtcCents: 10_550,
    payerCompanyId: 'co_1',
    seller: {
      name: 'La Folie Douce',
      legalForm: 'SAS',
      siren: '552100554',
      vatNumber: 'FR89552100554',
      rcs: 'Chambéry B 552 100 554',
      shareCapitalCents: 1_000_000,
      addressLines: ['12 rue du Fournil', '73000 Chambéry'],
    },
    buyer: {
      name: 'Boulangerie du Port',
      legalForm: 'SARL',
      siren: '303265045',
      vatNumber: 'FR40303265045',
      billingAddressLines: ['1 quai du Port'],
    },
    orders: [
      { reference: 'CMD-1', deliveredOn: '2026-09-12' },
      { reference: 'CMD-2', deliveredOn: null },
    ],
    lines: [
      {
        sku: 'PAIN',
        label: 'Pain du mois',
        unitCode: 'H87',
        quantityThousandths: 2_000,
        unitPriceMillicents: 500_000,
        vatRate: 5.5,
        amountCents: 10_000,
      },
    ],
    vat: {
      categories: [
        {
          rate: 5.5,
          goodsHtCents: 10_000,
          allowancesCents: 0,
          chargesCents: 0,
          taxableBaseCents: 10_000,
          vatCents: 550,
        },
      ],
      goodsHtCents: 10_000,
      allowancesCents: 0,
      chargesCents: 0,
    },
    mentions: {
      latePenaltyRateBasisPoints: 1_415,
      recoveryIndemnityCents: 4_000,
      earlyPaymentDiscount: 'néant',
    },
    mandateReference: 'RUM-PORT-1',
    documentAvailable: false,
    ...over,
  };
}

async function render(
  answer: () => Promise<IssuedInvoiceView>,
): Promise<ComponentFixture<FactureEmisePage>> {
  TestBed.configureTestingModule({
    imports: [FactureEmisePage],
    providers: [provideRouter([]), { provide: IssuedInvoicesService, useValue: { one: answer } }],
  });
  const fixture = TestBed.createComponent(FactureEmisePage);
  fixture.componentRef.setInput('id', 'inv_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<FactureEmisePage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('FactureEmisePage', () => {
  it('rend la pièce figée : émission, période, échéance, lignes, TTC, mentions, règlement, bons', async () => {
    const page = host(await render(() => Promise.resolve(issuedInvoice())));

    expect(page.querySelector('[data-invoice-issued]')?.textContent).toMatch(
      /Émise le 30 sept\. 2026.*septembre 2026.*échéance le 15 oct\. 2026/su,
    );
    expect(page.querySelector('[data-invoice-total]')?.textContent).toMatch(/105,50\s€/u);
    expect(page.querySelector('[data-invoice-means]')?.textContent).toContain('RUM-PORT-1');
    expect(page.textContent).toContain('14,15 %');
    expect(page.textContent).toContain('Pain du mois');
    expect(page.textContent).toContain('livraison non constatée');
    expect(page.querySelector('a[href="/comptes-clients/co_1/facturation"]')).not.toBeNull();
  });

  it('un avoir cite la facture qu’il corrige', async () => {
    const page = host(
      await render(() =>
        Promise.resolve(
          issuedInvoice({
            kind: 'credit_note',
            correctedInvoiceNumber: 'FA-2026-000001',
            dueOn: null,
          }),
        ),
      ),
    );

    expect(page.querySelector('[data-invoice-issued]')?.textContent).toContain(
      'corrige la facture FA-2026-000001',
    );
  });

  it('une pièce inconnue (404) se dit introuvable, pas en panne', async () => {
    const page = host(await render(() => Promise.reject(new HttpErrorResponse({ status: 404 }))));

    expect(page.textContent).toContain('Facture introuvable');
    expect(page.textContent).not.toContain('Impossible de lire');
  });
});
