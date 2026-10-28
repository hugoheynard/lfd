import { TestBed } from '@angular/core/testing';
import type { InvoiceDossierInvoiceView, InvoiceDossierLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { dossier } from '../../__tests__/invoice-dossier-fixture';
import { DossierInvoice } from './dossier-invoice';

/** La facture du dossier dit le poids comme la facture émise (plan vente au poids, § 3 bis). */
function render(invoice: InvoiceDossierInvoiceView): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [DossierInvoice] });
  const fixture = TestBed.createComponent(DossierInvoice);
  fixture.componentRef.setInput('invoice', invoice);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DossierInvoice — les quantités', () => {
  it('dit « 1,250 kg » pour une ligne au poids et « 3 » pour une ligne de pièces', () => {
    const base = dossier().invoice;
    const [pain] = base.lines;
    if (pain === undefined) {
      throw new TypeError('la fixture du dossier porte une ligne de pain');
    }
    const gravlax: InvoiceDossierLineView = {
      ...pain,
      sku: 'GRAV-1',
      label: 'Saumon gravlax',
      unitCode: 'KGM',
      quantityThousandths: 1_250,
    };

    const text = render({ ...base, lines: [...base.lines, gravlax] }).textContent ?? '';

    expect(text).toContain('1,250 kg');
    expect(text).not.toContain('1250');
    expect(text).not.toContain('3000');
  });
});
