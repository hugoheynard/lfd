import { Component, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OrderDetail } from '@lfd/b2b-ui/order';
import type { AdminOrderView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { OrderCancelComponent } from '../order-cancel/order-cancel';
import { OrderItemLimitOverridesCard } from '../order-item-limit-overrides-card/order-item-limit-overrides-card';
import { AdminOrdersService } from '../orders.service';
import { adminOrder } from './admin-order-fixture';

/**
 * Régression : avec les VRAIS composants projetés, la colonne du milieu restait
 * vide — `NG0950` (« Input "revisability" is required but no value is available
 * yet ») levé par l'annulation projetée, qui interrompait le rendu.
 */
const ORDER: AdminOrderView = adminOrder({
  itemLimitOverrides: [
    {
      sku: 'PAIN-LEV',
      staffUserId: 'stf_1',
      staffName: 'Camille',
      reason: 'Appel du client.',
      daysBefore: 2,
      time: '12:00',
      limitAt: '2026-11-22T11:00:00.000Z',
      origin: 'placement',
      recordedAt: '2026-11-20T09:00:00.000Z',
    },
  ],
});

@Component({
  imports: [OrderDetail, OrderCancelComponent, OrderItemLimitOverridesCard],
  template: `<lfd-order-detail audience="staff" [order]="order" [framed]="true">
    <app-order-item-limit-overrides-card
      belowLines
      [overrides]="order.itemLimitOverrides"
      [lines]="order.lines"
    />
    <app-order-cancel
      asideBottom
      [orderId]="order.id"
      [cancellability]="order.cancellability"
      [revisability]="{ revisable: true }"
    />
  </lfd-order-detail>`,
})
class StaffHost {
  protected readonly order = ORDER;
}

describe('lfd-order-detail — avec les vrais composants projetés côté staff', () => {
  it('rend la composition, le callout des limites et la zone d’annulation, sans erreur', () => {
    const errors = vi.fn();
    const permissions: readonly StaffPermission[] = ['b2b_cancel_order:write'];
    TestBed.configureTestingModule({
      providers: [
        { provide: ErrorHandler, useValue: { handleError: errors } },
        { provide: AdminOrdersService, useValue: { cancel: vi.fn() } },
        {
          provide: PermissionsStore,
          useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
        },
      ],
    });
    const fixture = TestBed.createComponent(StaffHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(errors).not.toHaveBeenCalled();
    expect(el.querySelector('.od-lines fold-card[data-composition-card] table')).not.toBeNull();
    expect(
      el.querySelector(
        '[data-composition-card] + app-order-item-limit-overrides-card [data-item-limit-overrides]',
      ),
    ).not.toBeNull();
    expect(el.querySelector('.od-side fold-danger-zone[data-cancel-zone]')).not.toBeNull();
  });
});
