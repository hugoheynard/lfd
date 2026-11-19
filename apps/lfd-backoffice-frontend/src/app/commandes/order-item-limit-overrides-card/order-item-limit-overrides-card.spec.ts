import { TestBed } from '@angular/core/testing';
import type { AdminOrderItemLimitOverride, OrderLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderItemLimitOverridesCard } from './order-item-limit-overrides-card';

/** Les instants ne sont comparés qu'à l'affichage : aucun n'est confronté à l'horloge. */
const OVERRIDE: AdminOrderItemLimitOverride = {
  sku: 'PAIN-LEV',
  staffUserId: 'staff_01',
  staffName: 'Camille Martin',
  reason: 'Le client a appelé avant midi.',
  daysBefore: 2,
  time: '12:00',
  limitAt: '2030-03-10T11:00:00.000Z',
  origin: 'placement',
  recordedAt: '2030-03-10T14:30:00.000Z',
};

async function render(
  overrides: readonly AdminOrderItemLimitOverride[] | undefined,
  lines: readonly Pick<OrderLineView, 'sku' | 'productName'>[] = [],
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(OrderItemLimitOverridesCard);
  fixture.componentRef.setInput('overrides', overrides);
  fixture.componentRef.setInput('lines', lines);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderItemLimitOverridesCard', () => {
  it('ne rend rien quand le serveur ne sert pas la liste (sans le droit)', async () => {
    expect((await render(undefined)).querySelector('[data-item-limit-overrides]')).toBeNull();
  });

  it('ne rend rien sans dépassement', async () => {
    expect((await render([])).querySelector('[data-item-limit-overrides]')).toBeNull();
  });

  it('dit le produit par son nom, la limite, le motif, qui et quand', async () => {
    const host = await render([OVERRIDE], [{ sku: 'PAIN-LEV', productName: 'Pain au levain' }]);
    const text = (host.textContent ?? '').replace(/\s+/gu, ' ');
    expect(text).toContain('Limites de produit dépassées');
    expect(text).toContain('Pain au levain');
    expect(text).toContain('2 jours avant, 12:00');
    expect(text).toContain('Le client a appelé avant midi.');
    expect(text).toContain('Camille Martin');
    expect(text).not.toContain('staff_01');
    expect(text).toContain('à la saisie');
  });

  it("retombe sur l'identifiant quand le serveur ne connaît pas de nom", async () => {
    const host = await render([{ ...OVERRIDE, staffName: null }]);
    expect(host.textContent).toContain('staff_01');
  });

  it('retombe sur le SKU quand la ligne est inconnue', async () => {
    const host = await render([{ ...OVERRIDE, origin: 'revision' }]);
    expect(host.textContent).toContain('PAIN-LEV');
    expect(host.textContent).toContain('en modification');
  });
});
