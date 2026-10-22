import { TestBed } from '@angular/core/testing';
import type { InvoiceDossierView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { dossier, dossierOrder } from '../../__tests__/invoice-dossier-fixture';
import { DossierOrders } from './dossier-orders';

function render(view: InvoiceDossierView): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [DossierOrders] });
  const fixture = TestBed.createComponent(DossierOrders);
  fixture.componentRef.setInput('dossier', view);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DossierOrders — les bons du dossier', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('marque le bon annulé après facturation, et lui seul', () => {
    const root = render(
      dossier({
        orders: [
          dossierOrder({ reference: 'CMD-1' }),
          dossierOrder({ reference: 'CMD-2', cancelledAfterInvoicing: true }),
        ],
      }),
    );

    const badges = root.querySelectorAll('[data-dossier-cancelled-after-invoicing]');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toContain('Annulé après facturation');
  });
});
