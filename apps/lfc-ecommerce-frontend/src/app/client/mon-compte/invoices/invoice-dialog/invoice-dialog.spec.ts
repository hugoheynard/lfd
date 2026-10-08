import { TestBed } from '@angular/core/testing';
import type { IssuedInvoiceView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';

import { ClientInvoices } from '../../../client-invoices.service';
import { CREDIT_NOTE, SEPTEMBER_DETAIL } from '../invoice.fixture';
import { InvoiceDialog } from './invoice-dialog';

let asked: string[];

async function render(answer: () => Promise<IssuedInvoiceView>): Promise<HTMLElement> {
  asked = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InvoiceDialog],
    providers: [
      { provide: FoldPanelRef, useValue: { close: (): void => undefined } },
      {
        provide: ClientInvoices,
        useValue: {
          one: (companyId: string, invoiceId: string) => {
            asked.push(`${companyId}/${invoiceId}`);
            return answer();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(InvoiceDialog);
  fixture.componentRef.setInput('data', { companyId: 'cmp_1', invoiceId: 'inv_1' });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('InvoiceDialog', () => {
  it('lit la pièce et la rend telle que figée : lignes, ventilation, TTC, mentions, règlement, bons', async () => {
    const el = await render(() => Promise.resolve(SEPTEMBER_DETAIL));

    expect(asked).toEqual(['cmp_1/inv_1']);
    expect(el.querySelector('[data-invoice-meta]')?.textContent).toContain(
      'échéance le 15 oct. 2026',
    );
    expect(el.querySelector('[data-invoice-lines]')?.textContent).toContain('Pain du mois');
    expect(el.querySelector('[data-invoice-lines]')?.textContent).toContain('2 × 5,00 €');
    expect(el.querySelector('[data-invoice-total]')?.textContent).toMatch(/105,50\s€/u);
    expect(el.querySelector('[data-invoice-means]')?.textContent).toContain('RUM-PORT-1');
    expect(el.textContent).toContain('14,15 %');
    expect(el.textContent).toContain('livraison non constatée');
    // Le PDF n'existe pas encore (E3b) : le dialogue le dit.
    expect(el.textContent).toContain('n’est pas encore disponible');
  });

  it('un avoir cite la facture qu’il corrige', async () => {
    const el = await render(() =>
      Promise.resolve({ ...SEPTEMBER_DETAIL, ...CREDIT_NOTE, mandateReference: null }),
    );

    expect(el.querySelector('[data-invoice-meta]')?.textContent).toContain(
      'corrige la facture FA-2026-000007',
    );
  });

  it('un échec de lecture se dit, sans pièce à moitié', async () => {
    const el = await render(() => Promise.reject(new Error('404')));

    expect(el.querySelector('[data-invoice-failed]')).not.toBeNull();
    expect(el.querySelector('[data-invoice-lines]')).toBeNull();
  });
});
