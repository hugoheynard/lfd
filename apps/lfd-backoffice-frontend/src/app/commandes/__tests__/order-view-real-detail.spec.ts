import { Component, ErrorHandler, NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { OrderDetail, OrderDetailHead, OrderDocumentsList } from '@lfd/b2b-ui/order';
import type { StaffPermission } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
} from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { OrderCancelComponent } from '../order-cancel/order-cancel';
import { OrderItemLimitOverridesCard } from '../order-item-limit-overrides-card/order-item-limit-overrides-card';
import { OrderPlacedByComponent } from '../order-placed-by/order-placed-by';
import { OrderViewComponent } from '../order-view/order-view';
import { ORDER_VIEW_TABS } from '../order-view-tabs';
import { AdminOrdersService } from '../orders.service';
import { adminOrder } from './admin-order-fixture';

/**
 * Régression : sur `/commandes/:id`, la colonne du milieu de « Détail » restait
 * vide — `NG0950` levé par l'annulation projetée dans le détail partagé
 * (« Input "revisability" is required but no value is available yet »).
 * Monté ici avec les VRAIS composants projetés, pas des éléments inconnus.
 */
@Component({ imports: [OrderViewComponent], template: '<app-order-view orderId="ord_9" />' })
class Host {}

/** Comme la page `/commandes/:id` : la barre est dans la bande, la vue y accroche ses panneaux. */
@Component({
  imports: [OrderViewComponent, FoldTabsComponent],
  template: `
    <fold-tabs #bar="foldTabs" [tabs]="tabs" [activeKey]="'detail'" />
    <app-order-view orderId="ord_9" [showHead]="false" [tabBar]="bar" />
  `,
})
class BandHost {
  protected readonly tabs = ORDER_VIEW_TABS;
}

const ORDER = adminOrder({
  cancellability: { cancellable: true, voucher: null, refund: null },
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

describe('OrderViewComponent — le détail rendu avec ses vrais composants projetés', () => {
  it.each([
    ['sous la fiche d’un compte (barre dans la vue)', Host],
    ['sur `/commandes/:id` (barre dans la bande)', BandHost],
  ])(
    '%s : composition, callout et annulation dans la colonne du milieu, dans l’ordre, sans erreur',
    async (_label, host) => {
      const errors = vi.fn();
      const permissions: readonly StaffPermission[] = ['b2b_cancel_order:write'];
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'commandes/:orderId', component: host }]),
          { provide: ErrorHandler, useValue: { handleError: errors } },
          { provide: AdminOrdersService, useValue: { byId: async () => ORDER, cancel: vi.fn() } },
          {
            provide: PermissionsStore,
            useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
          },
        ],
      });
      TestBed.overrideComponent(OrderViewComponent, {
        set: {
          imports: [
            FoldButtonComponent,
            FoldCardComponent,
            FoldElementTitleComponent,
            FoldEmptyStateComponent,
            FoldLoadingStateComponent,
            FoldTabPanelComponent,
            FoldTabsComponent,
            OrderCancelComponent,
            OrderDetail,
            OrderDetailHead,
            OrderDocumentsList,
            OrderItemLimitOverridesCard,
            OrderPlacedByComponent,
          ],
          providers: [],
          schemas: [NO_ERRORS_SCHEMA],
        },
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/commandes/ord_9');
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await harness.fixture.whenStable();
        harness.detectChanges();
      }
      const el = harness.fixture.nativeElement as HTMLElement;

      expect(errors).not.toHaveBeenCalled();
      const middle = el.querySelector('fold-tab-panel[data-tab="detail"] .od-lines');
      // La composition puis les limites : enfants DIRECTS de la colonne du milieu, dans cet ordre.
      const blocks = [...(middle?.children ?? [])].map((child) =>
        child.matches('fold-card[data-composition-card]')
          ? 'composition'
          : child.matches('app-order-item-limit-overrides-card')
            ? 'limits'
            : null,
      );
      expect(blocks.filter((block) => block !== null)).toEqual(['composition', 'limits']);
      expect(middle?.querySelector('fold-card[data-composition-card] table')).not.toBeNull();
      expect(middle?.querySelector('[data-item-limit-overrides]')).not.toBeNull();
      // L'annulation clôt le rail droit, hors de la colonne du milieu, après le résumé.
      const side = el.querySelector('fold-tab-panel[data-tab="detail"] .od-side');
      expect(side?.querySelector('fold-danger-zone[data-cancel-zone]')).not.toBeNull();
      expect(
        side?.querySelector('.od-side-info')?.lastElementChild?.matches('app-order-cancel'),
      ).toBe(true);
      expect(middle?.querySelector('app-order-cancel')).toBeNull();
    },
  );
});
