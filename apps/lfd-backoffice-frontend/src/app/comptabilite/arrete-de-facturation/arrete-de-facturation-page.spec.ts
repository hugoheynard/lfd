import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { BillingStatementView } from '@lfd/contracts';

import { BillingStatementsService } from '../billing-statements.service';
import { ArreteDeFacturationPage } from './arrete-de-facturation-page';

/**
 * Ce que ces cas tiennent (plan `plan-le-prelevement-suit-la-facture.md`, F4) :
 * l'arrêté se relit tel que figé — bandeau, montant prélevé, écart aux bons,
 * facture, bons couverts ; annulé, il le dit et ne prétend plus être prélevé ;
 * inconnu, il ne se confond pas avec une panne.
 */

function statement(over: Partial<BillingStatementView> = {}): BillingStatementView {
  return {
    id: 'st_1',
    batchId: 'b1',
    lineRank: 2,
    status: 'active',
    batchStatus: 'constituted',
    seller: {
      name: 'La Folie Douce',
      legalForm: 'SAS',
      siren: '552100554',
      vatNumber: 'FR89552100554',
      rcs: 'Chambéry B 552 100 554',
      shareCapitalCents: 1_000_000,
      addressLines: ['12 rue du Fournil', '73000 Chambéry'],
      ics: 'FR72ZZZ123456',
    },
    buyer: {
      companyId: 'co_1',
      name: 'Boulangerie du Port',
      legalForm: 'SARL',
      siret: '55210055400013',
      siren: '552100554',
      vatNumber: '',
      billingAddressLines: [],
    },
    issuedOn: '2026-10-02',
    periodStartsOn: '2026-09-03',
    periodEndsOn: '2026-09-28',
    totalHtCents: 9_496,
    totalVatCents: 522,
    totalTtcCents: 10_018,
    ordersTotalCents: 10_019,
    invoice: {
      lines: [],
      companyDiscountCents: 0,
      voucherDiscountCents: 0,
      lateFeeCents: 0,
      deliveries: [],
      vat: {
        categories: [],
        goodsHtCents: 9_496,
        allowancesCents: 0,
        chargesCents: 0,
        taxableBaseCents: 9_496,
        vatCents: 522,
        totalCents: 10_018,
      },
      totalCents: 10_018,
    },
    bodyVersion: 1,
    computedWith: 'invoice-dossier/2026-10-08',
    orders: [
      { orderId: 'o1', orderNumber: 'CMD-1' },
      { orderId: 'o2', orderNumber: null },
    ],
    ...over,
  };
}

async function render(
  answer: () => Promise<BillingStatementView>,
): Promise<ComponentFixture<ArreteDeFacturationPage>> {
  TestBed.configureTestingModule({
    imports: [ArreteDeFacturationPage],
    providers: [
      provideRouter([]),
      { provide: BillingStatementsService, useValue: { one: answer } },
    ],
  });
  const fixture = TestBed.createComponent(ArreteDeFacturationPage);
  fixture.componentRef.setInput('id', 'st_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<ArreteDeFacturationPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ArreteDeFacturationPage', () => {
  it('rend l’arrêté figé : bandeau, montant prélevé, écart, facture, bons', async () => {
    const page = host(await render(() => Promise.resolve(statement())));

    expect(page.querySelector('[data-statement-frozen]')?.textContent).toMatch(
      /Arrêté figé le 2 oct\. 2026.*c’est ce montant qui\s+est prélevé.*100,18\s€/su,
    );
    expect(page.querySelector('[data-statement-gap]')?.textContent).toMatch(/−0,01\s€/u);
    expect(page.querySelector('[data-dossier-invoice-total]')?.textContent).toMatch(/100,18\s€/u);
    expect(page.textContent).toContain('Boulangerie du Port');
    expect(page.textContent).toContain('CMD-1');
    expect(page.textContent).toContain('o2');
    expect(page.querySelector('[data-statement-cancelled]')).toBeNull();
  });

  it('un arrêté annulé le dit, et ne se dit plus prélevé', async () => {
    const page = host(
      await render(() =>
        Promise.resolve(statement({ status: 'cancelled', batchStatus: 'cancelled' })),
      ),
    );

    expect(page.querySelector('[data-statement-cancelled]')?.textContent).toContain(
      'Arrêté annulé avec son lot',
    );
    expect(page.querySelector('[data-statement-frozen]')).toBeNull();
    expect(page.textContent).toContain('Annulé');
  });

  it('un arrêté inconnu (404) se dit introuvable, pas en panne', async () => {
    const page = host(await render(() => Promise.reject(new HttpErrorResponse({ status: 404 }))));

    expect(page.textContent).toContain('Arrêté introuvable');
    expect(page.textContent).not.toContain('Impossible de lire');
  });
});
