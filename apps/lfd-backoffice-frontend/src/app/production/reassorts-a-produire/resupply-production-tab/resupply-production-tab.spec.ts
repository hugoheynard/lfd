import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  LiveStockAlertsView,
  ResupplyProductionDayView,
  StaffPermission,
} from '@lfd/contracts';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { LiveStockAlertsService } from '../live-stock-alerts.service';
import { ResuppliesToProduceService } from '../resupplies-to-produce.service';
import { ResupplyProductionTab } from './resupply-production-tab';

/**
 * L'onglet « Réassorts » de Prod manager (lot R3d, 2026-10-21) : la table de
 * la demande, vue du fournil — figés compris, et la journée qu'on déplace.
 */
class FakeResupplies {
  readonly asked: string[] = [];
  stopped = false;
  day(serviceDay: string): Promise<ResupplyProductionDayView> {
    this.asked.push(serviceDay);
    return Promise.resolve({
      serviceDay,
      planStopped: this.stopped,
      transferSiteIds: [],
      sites: [
        {
          siteId: 'labo',
          siteLabel: 'Le Labo',
          resupplies: [
            {
              id: 'r1',
              siteId: 'labo',
              serviceDay,
              target: 'tomorrow',
              origin: 'counter',
              name: null,
              status: 'placed',
              lines: [{ sku: 'CRO', label: 'Croissant', quantity: 10 }],
              placedAt: '2026-01-02T17:00:00.000Z',
              placedBy: null,
              cancelledAt: null,
              cancelledBy: null,
              arrivedAt: null,
              arrivedBy: null,
            },
          ],
        },
      ],
      totals: [{ sku: 'CRO', label: 'Croissant', quantity: 10 }],
      articles: [
        { sku: 'CRO', name: 'Croissant', categoryId: 'fam_m', categoryName: 'Viennoiseries' },
        { sku: 'BAG', name: 'Baguette', categoryId: 'fam_b', categoryName: 'Pains' },
      ],
    });
  }
}

class FakeAlerts {
  read(): Promise<LiveStockAlertsView> {
    return Promise.resolve({ sites: [] });
  }
}

async function mount(resupplies = new FakeResupplies(), granted: readonly StaffPermission[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyProductionTab],
    providers: [
      provideRouter([]),
      { provide: ResuppliesToProduceService, useValue: resupplies },
      { provide: LiveStockAlertsService, useValue: new FakeAlerts() },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          loaded: signal(true),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ResupplyProductionTab);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe("l'onglet Réassorts de Prod manager", () => {
  it('lit demain par défaut, et montre une ligne par produit avec son total', async () => {
    const resupplies = new FakeResupplies();
    const { el } = await mount(resupplies);
    expect(resupplies.asked).toHaveLength(1);
    expect(el.querySelector('[data-resupply-point="labo"]')?.textContent).toContain('Le Labo');
    expect(
      el.querySelector('[data-resupply-row="CRO"] [data-resupply-total]')?.textContent,
    ).toContain('10');
    expect(el.querySelector('[data-resupply-row="BAG"]')).not.toBeNull();
    expect(el.querySelector('[data-resupply-pieces]')?.textContent).toContain('10');
  });

  it('dit les « pour demain » figés quand le plan est arrêté', async () => {
    const resupplies = new FakeResupplies();
    resupplies.stopped = true;
    const { el } = await mount(resupplies);
    expect(el.querySelector('[data-resupply-plan-stopped]')).not.toBeNull();
    expect(el.textContent).toContain('Pour demain · figé');
  });

  it("n'offre l'envoi du fournil qu'à qui tient son droit", async () => {
    const without = await mount();
    expect(without.el.querySelector('app-bakehouse-resupply-card')).toBeNull();
  });

  /** Lot R3e : le Labo est servi sur place, ses réassorts sont « à monter ». */
  it('montre la carte « À monter », en lecture sans le droit du fournil', async () => {
    const { el } = await mount();
    expect(el.querySelector('[data-resupply-mount-row="r1"]')?.textContent).toContain('Le Labo');
    expect(el.querySelector('[data-resupply-mount]')).toBeNull();
  });

  it('déplace la journée d’un clic, et relit', async () => {
    const resupplies = new FakeResupplies();
    const { fixture } = await mount(resupplies);
    fixture.componentInstance['shift'](1);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(resupplies.asked).toHaveLength(2);
    expect((resupplies.asked[1] ?? '') > (resupplies.asked[0] ?? '')).toBe(true);
  });
});
