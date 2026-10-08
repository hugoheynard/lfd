import { TestBed } from '@angular/core/testing';
import type { OrderRefundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderRefundsCard } from './order-refunds-card';

/** Les instants ne sont comparés qu'à l'affichage : aucun n'est confronté à l'horloge. */
const PARTIAL: OrderRefundView = {
  amountCents: 1_250,
  status: 'succeeded',
  refundedAt: '2030-03-12T08:10:00.000Z',
};
const PENDING: OrderRefundView = {
  amountCents: 500,
  status: 'pending',
  refundedAt: '2030-03-13T09:00:00.000Z',
};

async function render(refunds: readonly OrderRefundView[]): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(OrderRefundsCard);
  fixture.componentRef.setInput('refunds', refunds);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderRefundsCard', () => {
  it('ne rend rien sans remboursement', async () => {
    const element = await render([]);
    expect(element.querySelector('[data-refunds-card]')).toBeNull();
  });

  it('montre chaque remboursement, son statut, et le cumul des seuls réussis', async () => {
    const element = await render([PARTIAL, PENDING]);

    const rows = element.querySelectorAll('[data-refund]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('12,50');
    expect(rows[0]?.textContent).toContain('Remboursé');
    expect(rows[1]?.textContent).toContain('En cours');
    // Le remboursement en attente ne compte pas : seul le réussi est rendu.
    expect(element.querySelector('[data-refunds-total]')?.textContent).toContain('12,50');
  });
});
