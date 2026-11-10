import { TestBed } from '@angular/core/testing';
import type { OrderRefundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderRefundsCard } from './order-refunds-card';

/** Les instants ne sont comparés qu'à l'affichage : aucun n'est confronté à l'horloge. */
const PARTIAL: OrderRefundView = {
  amountCents: 1_250,
  status: 'succeeded',
  refundedAt: '2030-03-12T08:10:00.000Z',
  source: 'provider',
};
const PENDING: OrderRefundView = {
  amountCents: 500,
  status: 'pending',
  refundedAt: '2030-03-13T09:00:00.000Z',
  source: 'provider',
};
const MANUAL: OrderRefundView = {
  amountCents: 300,
  status: 'succeeded',
  refundedAt: '2030-03-14T10:00:00.000Z',
  source: 'manual',
};

async function render(
  refunds: readonly OrderRefundView[],
  refundedCents = 0,
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(OrderRefundsCard);
  fixture.componentRef.setInput('refunds', refunds);
  fixture.componentRef.setInput('refundedCents', refundedCents);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderRefundsCard', () => {
  it('ne rend rien sans remboursement', async () => {
    const element = await render([]);
    expect(element.querySelector('[data-refunds-card]')).toBeNull();
  });

  it('montre chaque remboursement, son statut, et le total SERVI', async () => {
    // Le total servi diffère volontairement de toute somme des lignes : la
    // carte ne recalcule plus rien (plan M2, §3.3, une seule arithmétique).
    const element = await render([PARTIAL, PENDING], 9_999);

    const rows = element.querySelectorAll('[data-refund]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('12,50');
    expect(rows[0]?.textContent).toContain('Remboursé');
    expect(rows[1]?.textContent).toContain('En cours');
    expect(element.querySelector('[data-refunds-total]')?.textContent).toContain('99,99');
  });

  it('un remboursement noté par l’équipe se dit « Rendu autrement »', async () => {
    const element = await render([MANUAL], 300);

    expect(element.querySelector('[data-refund]')?.textContent).toContain('Rendu autrement');
  });
});
