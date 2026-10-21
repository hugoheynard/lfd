import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  LiveStockAlertsView,
  PlaceSiteResupplyPayload,
  ResuppliesToProduceView,
  SiteResupplyView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { SiteResuppliesService } from '../../comptoir/reassort-boutique-page/site-resupplies.service';
import { LiveStockAlertsService } from './live-stock-alerts.service';
import { LiveStockAlertsCard } from './live-stock-alerts-card/live-stock-alerts-card';
import { ResuppliesToProducePage } from './resupplies-to-produce-page';
import { ResuppliesToProduceService } from './resupplies-to-produce.service';

/**
 * Réassorts à produire (R1, 2026-10-21) : l'écran du fournil, en lecture —
 * par journée, le cumul par article puis chaque point. Rien n'y est un geste.
 */
const TODAY = '2026-01-02';
const TOMORROW = '2026-01-03';

function resupply(id: string, target: 'asap' | 'tomorrow', serviceDay: string): SiteResupplyView {
  return {
    id,
    siteId: 'site_v',
    serviceDay,
    target,
    status: 'placed',
    lines: [{ sku: 'CRO', label: 'Croissant', quantity: 12 }],
    placedAt: '2026-01-02T08:30:00.000Z',
    placedBy: 'Lou',
    cancelledAt: null,
    cancelledBy: null,
  };
}

const VIEW: ResuppliesToProduceView = {
  days: [
    {
      serviceDay: TODAY,
      sites: [
        {
          siteId: 'site_v',
          siteLabel: 'Val Village',
          resupplies: [resupply('rs1', 'tomorrow', TODAY), resupply('rs2', 'asap', TODAY)],
        },
      ],
      totals: [{ sku: 'CRO', label: 'Croissant', quantity: 24 }],
    },
    { serviceDay: TOMORROW, sites: [], totals: [] },
  ],
};

class FakeService {
  reads = 0;
  fail = false;
  read(): Promise<ResuppliesToProduceView> {
    this.reads += 1;
    return this.fail ? Promise.reject(new Error('hors ligne')) : Promise.resolve(VIEW);
  }
}

/** Les alertes vivantes des points (R1b). */
const ALERTS: LiveStockAlertsView = {
  sites: [
    {
      siteId: 'site_v',
      siteLabel: 'Village',
      alerts: [
        {
          id: 'alert_1',
          siteId: 'site_v',
          sku: 'CRO',
          label: 'Croissant',
          level: 'out_of_stock',
          declaredAt: '2026-01-02T08:30:00.000Z',
          declaredBy: 'Lou',
        },
      ],
    },
  ],
};

class FakeAlerts {
  read(): Promise<LiveStockAlertsView> {
    return Promise.resolve(ALERTS);
  }
}

/** La passation du comptoir, doublée : retient ce qui est passé. */
class FakeResupplies {
  readonly placed: { siteId: string; payload: PlaceSiteResupplyPayload }[] = [];
  place(siteId: string, payload: PlaceSiteResupplyPayload): Promise<{ id: string }> {
    this.placed.push({ siteId, payload });
    return Promise.resolve({ id: 'rs_new' });
  }
}

async function mount(
  api = new FakeService(),
  permissions: readonly StaffPermission[] = ['production_worksheet:read'],
  resupplies = new FakeResupplies(),
): Promise<{ fixture: ComponentFixture<ResuppliesToProducePage>; root: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResuppliesToProducePage],
    providers: [
      { provide: ResuppliesToProduceService, useValue: api },
      { provide: LiveStockAlertsService, useValue: new FakeAlerts() },
      { provide: SiteResuppliesService, useValue: resupplies },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ResuppliesToProducePage);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('ResuppliesToProducePage', () => {
  it('par journée : le cumul par article, puis le point et ses réassorts nommés par visée', async () => {
    const { root } = await mount();

    const today = root.querySelector(`[data-to-produce-day="${TODAY}"]`);
    expect(today?.textContent).toContain('Aujourd');
    expect(today?.querySelector('[data-to-produce-total="CRO"]')?.textContent).toContain('24');
    const site = today?.querySelector('[data-to-produce-site="site_v"]');
    expect(site?.textContent).toContain('Val Village');
    expect(site?.textContent).toContain('Pour demain');
    expect(site?.textContent).toContain('Au plus tôt');
    expect(site?.textContent).toContain('12 × Croissant');
    // 8 h 30 UTC = 9 h 30 à Paris en hiver : l'heure du four, pas celle du poste.
    expect(site?.textContent).toContain('09:30');
  });

  it('dit une journée sans réassort, et ne propose aucun geste', async () => {
    const { root } = await mount();

    expect(root.querySelector(`[data-to-produce-day="${TOMORROW}"]`)?.textContent).toContain(
      'Aucun réassort commandé',
    );
    expect(root.querySelector('fold-number-input, fold-combobox')).toBeNull();
  });

  it('dit l’échec par un état fold, et relit sur demande', async () => {
    const api = new FakeService();
    api.fail = true;
    const { fixture, root } = await mount(api);

    expect(root.querySelector('fold-empty-state')?.textContent).toContain(
      'Impossible de charger les réassorts',
    );
    api.fail = false;
    await fixture.componentInstance['load']();
    fixture.detectChanges();
    expect(api.reads).toBe(2);
    expect(root.querySelector(`[data-to-produce-day="${TODAY}"]`)).not.toBeNull();
  });
});

describe('ResuppliesToProducePage — alertes des points (R1b)', () => {
  it('dit en tête « Village : rupture — Croissant » ; sans le droit du comptoir, aucun bouton', async () => {
    const { root } = await mount();

    const alert = root.querySelector('[data-live-stock-alert="site_v:CRO"]');
    expect(alert?.textContent).toContain('Village : rupture — Croissant');
    expect(root.querySelector('[data-live-stock-alert-open]')).toBeNull();
  });

  it('avec le droit du comptoir, lance un réassort « au plus tôt » de cet article pour ce point', async () => {
    const api = new FakeService();
    const resupplies = new FakeResupplies();
    const { fixture, root } = await mount(
      api,
      ['production_worksheet:read', 'handover_counter:write'],
      resupplies,
    );

    root.querySelector<HTMLButtonElement>('[data-live-stock-alert-open]')?.click();
    fixture.detectChanges();
    const card: unknown = fixture.debugElement.query(
      By.css('app-live-stock-alerts-card'),
    ).componentInstance;
    if (!(card instanceof LiveStockAlertsCard)) {
      throw new Error('la carte des alertes manque');
    }
    card['quantity'].set(18);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-live-stock-alert-place]')?.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(resupplies.placed).toEqual([
      { siteId: 'site_v', payload: { target: 'asap', lines: [{ sku: 'CRO', quantity: 18 }] } },
    ]);
    // La page relit après la passation.
    expect(api.reads).toBe(2);
  });
});
