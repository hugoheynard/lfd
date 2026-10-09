import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import type { IssuedInvoiceView } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { IssuedInvoicesService } from '../issued-invoices.service';
import { FactureEmisePage } from './facture-emise-page';

/**
 * Ce que ces cas tiennent (plan `facture-emise.md`) : la
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
    paidOn: null,
    documentAvailable: false,
    ...over,
  };
}

const pdfAsked: string[] = [];
const failures: string[] = [];
const successes: string[] = [];
const resent: string[] = [];
let canWrite = true;
let resendAnswer: () => Promise<void> = () => Promise.resolve();

async function render(
  answer: () => Promise<IssuedInvoiceView>,
  pdf: () => Promise<Blob> = () => Promise.resolve(new Blob(['%PDF-'])),
): Promise<ComponentFixture<FactureEmisePage>> {
  pdfAsked.splice(0);
  failures.splice(0);
  successes.splice(0);
  resent.splice(0);
  TestBed.configureTestingModule({
    imports: [FactureEmisePage],
    providers: [
      provideRouter([]),
      {
        provide: IssuedInvoicesService,
        useValue: {
          one: answer,
          document: (invoiceId: string) => {
            pdfAsked.push(invoiceId);
            return pdf();
          },
          resendNotice: (invoiceId: string) => {
            resent.push(invoiceId);
            return resendAnswer();
          },
        },
      },
      {
        provide: NotifyService,
        useValue: {
          error: (_: unknown, fallback: string) => failures.push(fallback),
          success: (message: string) => successes.push(message),
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) => canWrite && permission === 'b2b_accounting:write',
        },
      },
    ],
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

  it('une facture carte se dit acquittée, au jour du paiement (E5a)', async () => {
    const page = host(
      await render(() =>
        Promise.resolve(issuedInvoice({ mandateReference: null, paidOn: '2026-09-28' })),
      ),
    );

    expect(page.querySelector('[data-invoice-means]')?.textContent).toMatch(
      /Acquittée par carte le 28 sept\. 2026/u,
    );
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

  it('tant que le PDF n’est pas rendu, la pièce le dit et n’offre aucun téléchargement', async () => {
    const page = host(await render(() => Promise.resolve(issuedInvoice())));

    expect(page.querySelector('[data-invoice-issued]')?.textContent).toContain('pas encore rendu');
    expect(page.querySelector('[data-invoice-pdf]')).toBeNull();
  });

  it('un PDF rendu se télécharge sous le numéro de la pièce ; un échec se notifie', async () => {
    const saved: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:facture');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    const ready = issuedInvoice({ documentAvailable: true });
    const page = host(await render(() => Promise.resolve(ready)));

    expect(page.querySelector('[data-invoice-issued]')?.textContent).not.toContain('pas encore');
    (page.querySelector('[data-invoice-pdf]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pdfAsked).toEqual([ready.invoiceId]);
    expect(saved).toEqual([`${ready.number}.pdf`]);
    vi.restoreAllMocks();

    TestBed.resetTestingModule();
    const failing = host(
      await render(
        () => Promise.resolve(ready),
        () => Promise.reject(new HttpErrorResponse({ status: 404 })),
      ),
    );
    (failing.querySelector('[data-invoice-pdf]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(failures).toEqual([
      `Le PDF de la pièce ${ready.number} n’a pas pu être téléchargé. Réessayez dans un instant.`,
    ]);
  });

  it('une pièce inconnue (404) se dit introuvable, pas en panne', async () => {
    const page = host(await render(() => Promise.reject(new HttpErrorResponse({ status: 404 }))));

    expect(page.textContent).toContain('Facture introuvable');
    expect(page.textContent).not.toContain('Impossible de lire');
  });

  describe('renvoyer « Votre facture » (E6, suite (b))', () => {
    it('renvoie et le dit ; un refus se notifie', async () => {
      canWrite = true;
      resendAnswer = () => Promise.resolve();
      const page = host(await render(() => Promise.resolve(issuedInvoice())));

      (page.querySelector('[data-invoice-resend]') as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(resent).toEqual(['inv_1']);
      expect(successes).toEqual(['L’e-mail de la facture FA-2026-000007 est reparti.']);

      resendAnswer = () => Promise.reject(new HttpErrorResponse({ status: 409 }));
      (page.querySelector('[data-invoice-resend]') as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(failures).toHaveLength(1);
    });

    it('ni pour un avoir, ni sans le droit d’écrire', async () => {
      canWrite = true;
      const note = host(
        await render(() =>
          Promise.resolve(
            issuedInvoice({ kind: 'credit_note', correctedInvoiceNumber: 'FA-1', dueOn: null }),
          ),
        ),
      );
      expect(note.querySelector('[data-invoice-resend]')).toBeNull();

      TestBed.resetTestingModule();
      canWrite = false;
      const readOnly = host(await render(() => Promise.resolve(issuedInvoice())));
      expect(readOnly.querySelector('[data-invoice-resend]')).toBeNull();
      canWrite = true;
    });
  });
});
