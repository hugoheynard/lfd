import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  LiveStockAlertsView,
  ResuppliesToProduceView,
  ResupplyOrigin,
  SiteResupplyView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { BakehouseResupplyCard } from './bakehouse-resupply-card/bakehouse-resupply-card';
import { BakehouseResuppliesService } from './bakehouse-resupplies.service';
import { LiveStockAlertsService } from './live-stock-alerts.service';
import { ResuppliesToProducePage } from './resupplies-to-produce-page';
import { ResuppliesToProduceService } from './resupplies-to-produce.service';

/**
 * Réassorts à produire (R1, 2026-10-21) : l'écran du fournil, en lecture —
 * par journée, le cumul par article puis chaque point. Rien n'y est un geste,
 * sauf « Envoyer un réassort » sous `production_resupply:write` (R1d).
 */
const TODAY = '2026-01-02';
const TOMORROW = '2026-01-03';

function resupply(
  id: string,
  target: 'asap' | 'tomorrow',
  serviceDay: string,
  origin: ResupplyOrigin = 'counter',
): SiteResupplyView {
  return {
    id,
    siteId: 'site_v',
    serviceDay,
    target,
    origin,
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
          resupplies: [
            resupply('rs1', 'tomorrow', TODAY),
            resupply('rs2', 'asap', TODAY),
            resupply('rs3', 'asap', TODAY, 'bakehouse'),
          ],
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

/** Les points et le catalogue de la carte « Envoyer un réassort » (R1d). */
class FakePickups {
  list(): Promise<readonly { id: string; label: string }[]> {
    return Promise.resolve([{ id: 'site_v', label: 'Val Village' }]);
  }
}

class FakeBakehouse {
  articles(): Promise<readonly { sku: string; name: string }[]> {
    return Promise.resolve([{ sku: 'CRO', name: 'Croissant' }]);
  }
  send(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'rs_new' });
  }
}

async function mount(
  api = new FakeService(),
  permissions: readonly StaffPermission[] = ['production_worksheet:read'],
): Promise<{ fixture: ComponentFixture<ResuppliesToProducePage>; root: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResuppliesToProducePage],
    providers: [
      { provide: ResuppliesToProduceService, useValue: api },
      { provide: LiveStockAlertsService, useValue: new FakeAlerts() },
      { provide: PickupAddressesService, useValue: new FakePickups() },
      { provide: BakehouseResuppliesService, useValue: new FakeBakehouse() },
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

describe('ResuppliesToProducePage — alertes des points (R1b), pour information (R1d)', () => {
  it('dit en tête « Village : rupture — Croissant »', async () => {
    const { root } = await mount();

    const alert = root.querySelector('[data-live-stock-alert="site_v:CRO"]');
    expect(alert?.textContent).toContain('Village : rupture — Croissant');
  });

  /**
   * Régression : « Lancer un réassort au plus tôt » envoyait la demande « au
   * plus tôt » DU COMPTOIR, avec ce que le comptoir y avait mis (R1b/R1c).
   */
  it('ne propose plus aucun geste sur une alerte, même avec le droit du comptoir', async () => {
    const { root } = await mount(new FakeService(), [
      'production_worksheet:read',
      'handover_counter:write',
    ]);

    const alerts = root.querySelector('[data-live-stock-alerts]');
    expect(alerts?.querySelector('button, fold-number-input')).toBeNull();
    expect(alerts?.textContent).not.toContain('Lancer un réassort');
  });
});

describe('ResuppliesToProducePage — le réassort envoyé par le fournil (R1d)', () => {
  it('marque « Envoyé par le fournil » ce que le fournil a envoyé, et lui seul', async () => {
    const { root } = await mount();

    const marks = root.querySelectorAll('[data-to-produce-bakehouse]');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toContain('Envoyé par le fournil');
  });

  it('« Envoyer un réassort » paraît sous production_resupply:write, et seulement là', async () => {
    const without = await mount();
    expect(without.root.querySelector('app-bakehouse-resupply-card')).toBeNull();

    const { root } = await mount(new FakeService(), [
      'production_worksheet:read',
      'production_resupply:write',
    ]);
    expect(root.querySelector('[data-bakehouse-resupply]')).not.toBeNull();
  });

  it('un envoi fait relire la page', async () => {
    const api = new FakeService();
    const { fixture } = await mount(api, [
      'production_worksheet:read',
      'production_resupply:write',
    ]);
    const card: unknown = fixture.debugElement.query(
      By.css('app-bakehouse-resupply-card'),
    ).componentInstance;
    if (!(card instanceof BakehouseResupplyCard)) {
      throw new Error('la carte « Envoyer un réassort » manque');
    }

    card.sent.emit();
    await fixture.whenStable();

    expect(api.reads).toBe(2);
  });
});
