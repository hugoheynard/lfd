import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { IssuedInvoiceView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';

import { ClientInvoices } from '../../../client-invoices.service';
import { CREDIT_NOTE, SEPTEMBER_DETAIL } from '../invoice.fixture';
import { InvoiceDialog } from './invoice-dialog';

let asked: string[];
let pdf: () => Promise<Blob>;

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
          document: (companyId: string, invoiceId: string) => {
            asked.push(`pdf:${companyId}/${invoiceId}`);
            return pdf();
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
    // Le PDF n'est pas encore rendu (E3b) : le dialogue le dit, sans bouton.
    expect(el.querySelector('[data-invoice-pdf-pending]')?.textContent).toContain('en préparation');
    expect(el.querySelector('[data-invoice-pdf]')).toBeNull();
  });

  it('une facture carte se dit acquittée, au jour du paiement (E5a)', async () => {
    const el = await render(() =>
      Promise.resolve({ ...SEPTEMBER_DETAIL, mandateReference: null, paidOn: '2026-09-28' }),
    );

    expect(el.querySelector('[data-invoice-means]')?.textContent).toContain(
      'Acquittée par carte le 28 sept. 2026',
    );
  });

  it('un PDF rendu se télécharge, nommé d’après le numéro de la pièce', async () => {
    pdf = () => Promise.resolve(new Blob(['%PDF-'], { type: 'application/pdf' }));
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:facture');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    const el = await render(() =>
      Promise.resolve({ ...SEPTEMBER_DETAIL, documentAvailable: true }),
    );

    expect(el.querySelector('[data-invoice-pdf-pending]')).toBeNull();
    (el.querySelector('[data-invoice-pdf]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(asked).toContain(`pdf:cmp_1/${SEPTEMBER_DETAIL.invoiceId}`);
    expect(created).toHaveBeenCalledTimes(1);
    expect(names).toEqual([`${SEPTEMBER_DETAIL.number}.pdf`]);
    vi.restoreAllMocks();
  });

  it('un téléchargement en échec se dit, la pièce reste à l’écran', async () => {
    pdf = () => Promise.reject(new Error('404'));
    const fixture = await render(() =>
      Promise.resolve({ ...SEPTEMBER_DETAIL, documentAvailable: true }),
    );

    (fixture.querySelector('[data-invoice-pdf]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();

    expect(fixture.querySelector('[data-invoice-pdf-failed]')).not.toBeNull();
    expect(fixture.querySelector('[data-invoice-lines]')).not.toBeNull();
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
