import { TestBed } from '@angular/core/testing';
import type { ShortfallAwaitingDecision, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryNotesService } from '../../commandes/delivery-notes.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { NotifyService } from '../../notify.service';
import { PackingShortfall } from './packing-shortfall';

/** Recopié à l'écran, jamais comparé à l'horloge. */
const SHORTFALL: ShortfallAwaitingDecision = {
  orderId: 'ord_1',
  reference: 'CMD-1',
  customerName: 'Boulangerie du Col',
  fulfillmentMethod: 'delivery',
  reportedAt: '2030-01-10T05:30:00.000Z',
  lines: [
    { sku: 'CRO', productName: 'Croissant', due: 12, packed: 9 },
    { sku: 'PAC', productName: 'Pain au chocolat', due: 6, packed: 0 },
    { sku: 'CHA', productName: 'Chausson aux pommes', due: 4, packed: 4 },
  ],
};

function mount(permissions: readonly StaffPermission[]) {
  const decideShortfall = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { decideShortfall } },
      { provide: DeliveryNotesService, useValue: { ofOrder: () => Promise.resolve([]) } },
      { provide: NotifyService, useValue: { error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingShortfall);
  fixture.componentRef.setInput('shortfall', SHORTFALL);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement };
}

describe('PackingShortfall — le manque sur la carte du colisage', () => {
  it('dit chaque ligne manquante aux quantités figées par le signalement', () => {
    const { el } = mount([]);
    const items = [...el.querySelectorAll('[data-shortfall-missing] li')].map((li) =>
      li.textContent?.trim(),
    );
    expect(items).toEqual([
      'Manque : Croissant — 9 sur 12 au bac',
      'Manque : Pain au chocolat — 0 sur 6 au bac',
    ]);
  });

  /** Régression : « Manque : Chausson aux pommes — 4 sur 4 au bac » s'affichait (2026-10-25). */
  it('ne dit pas manquante une ligne complète au bac', () => {
    const { el } = mount([]);
    expect(el.querySelector('[data-shortfall-missing]')?.textContent).not.toContain('Chausson');
  });

  it('sans le droit, le texte seul et « en attente d’une décision du commerce »', () => {
    const { el } = mount(['b2b_orders:read']);
    expect(el.querySelector('[data-shortfall-decide]')).toBeNull();
    expect(el.querySelector('[data-shortfall-waiting]')?.textContent).toContain(
      "En attente d'une décision du commerce",
    );
  });

  it('avec b2b_orders_shortfall:write, le bouton de décision de la fiche commande', () => {
    const { el } = mount(['b2b_orders_shortfall:write']);
    expect(el.querySelector('[data-shortfall-decide]')).not.toBeNull();
    expect(el.querySelector('[data-shortfall-waiting]')).toBeNull();
  });
});
