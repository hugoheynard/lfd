import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrderRevisionQuoteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { OrderRevisionGateway } from '../order-revision.gateway';
import type { QuoteState } from '../revision-quote/revision-quote';
import { ChangeRequestCard } from './change-request-card';

/**
 * **La carte de la demande** (plan `plan-modifier-une-commande.md`, §14) : le
 * devis de la demande est montré, et toujours dit INDICATIF.
 */

const QUOTE: OrderRevisionQuoteView = {
  revision: 1,
  lines: [],
  subtotalCents: 1_000,
  discountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  voucherDiscountCents: 0,
  vatCents: 55,
  totalCents: 1_055,
  previousTotalCents: 635,
  differenceCents: 420,
  changes: ['lines'],
};

function mount(quote: QuoteState): HTMLElement {
  TestBed.configureTestingModule({
    imports: [ChangeRequestCard],
    providers: [
      provideRouter([]),
      { provide: OrderRevisionGateway, useValue: {} },
      { provide: NotifyService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(ChangeRequestCard);
  fixture.componentRef.setInput('orderId', 'ord_9');
  fixture.componentRef.setInput('content', null);
  fixture.componentRef.setInput('revision', 1);
  fixture.componentRef.setInput('changed', true);
  fixture.componentRef.setInput('quote', quote);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ChangeRequestCard', () => {
  it('montre le nouveau total et l’écart de la demande, marqués indicatifs', () => {
    const el = mount({ kind: 'ready', quote: QUOTE });
    expect(el.querySelector('[data-total]')?.textContent).toContain('10,55');
    expect(el.querySelector('[data-difference]')?.textContent).toContain('+ 4,20');
    expect(el.querySelector('[data-quote-indicative]')?.textContent).toContain(
      'le montant appliqué peut différer',
    );
  });

  it('un devis refusé : la phrase du serveur, aucun montant', () => {
    const el = mount({ kind: 'refused', message: 'Commande réglée par carte.' });
    expect(el.querySelector('[data-quote-refused]')?.textContent).toContain('réglée par carte');
    expect(el.querySelector('[data-total]')).toBeNull();
  });

  it('un devis en panne : le dit, et propose de réessayer', () => {
    const el = mount({ kind: 'failed' });
    expect(el.querySelector('[data-quote-failed]')).not.toBeNull();
    expect(el.querySelector('[data-quote-indicative]')).toBeNull();
  });
});
