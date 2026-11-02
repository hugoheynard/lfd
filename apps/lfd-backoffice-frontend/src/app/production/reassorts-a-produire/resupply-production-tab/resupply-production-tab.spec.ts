import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  LiveStockAlertsView,
  ResupplyProductionDayView,
  StaffPermission,
} from '@lfd/contracts';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
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
  /** Un réassort au poids en plus (lot L2b-4) ; absent par défaut. */
  weighed = false;
  /** Le réassort du Labo est « au plus tôt » : la carte « Lancer » paraît (R4a). */
  asap = false;
  day(serviceDay: string): Promise<ResupplyProductionDayView> {
    this.asked.push(serviceDay);
    const view: ResupplyProductionDayView = {
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
              target: this.asap ? 'asap' : 'tomorrow',
              origin: 'counter',
              name: null,
              status: 'placed',
              lines: [{ sku: 'CRO', label: 'Croissant', quantity: 10, saleUnit: 'piece' as const }],
              placedAt: '2026-01-02T17:00:00.000Z',
              placedBy: null,
              cancelledAt: null,
              cancelledBy: null,
              arrivedAt: null,
              arrivedBy: null,
              launchedAt: null,
              launchedBy: null,
              departedAt: null,
              departedBy: null,
            },
          ],
        },
      ],
      totals: [{ sku: 'CRO', label: 'Croissant', quantity: 10, saleUnit: 'piece' as const }],
      articles: [
        {
          sku: 'CRO',
          name: 'Croissant',
          categoryId: 'fam_m',
          categoryName: 'Viennoiseries',
          saleUnit: 'piece' as const,
        },
        {
          sku: 'BAG',
          name: 'Baguette',
          categoryId: 'fam_b',
          categoryName: 'Pains',
          saleUnit: 'piece' as const,
        },
      ],
    };
    return Promise.resolve(this.weighed ? withWeight(view) : view);
  }
}

/** Le même jour, plus 1 250 g de gravlax demandés au Labo. */
function withWeight(view: ResupplyProductionDayView): ResupplyProductionDayView {
  const [labo] = view.sites;
  const [resupply] = labo?.resupplies ?? [];
  if (labo === undefined || resupply === undefined) {
    return view;
  }
  const weighedLine = { sku: 'GRA', label: 'Gravlax', quantity: 1250, saleUnit: 'weight' as const };
  return {
    ...view,
    sites: [{ ...labo, resupplies: [{ ...resupply, lines: [...resupply.lines, weighedLine] }] }],
    totals: [...view.totals, weighedLine],
    articles: [
      ...view.articles,
      {
        sku: 'GRA',
        name: 'Gravlax',
        categoryId: 'fam_t',
        categoryName: 'Traiteur',
        saleUnit: 'weight',
      },
    ],
  };
}

class FakeAlerts {
  read(): Promise<LiveStockAlertsView> {
    return Promise.resolve({ sites: [] });
  }
}

/** Le fournil : ses brouillons (vides) et « Lancer », qui consigne. */
class FakeBakehouse {
  readonly launched: string[] = [];
  drafts(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }
  launch(_day: string, resupplyId: string): Promise<void> {
    this.launched.push(resupplyId);
    return Promise.resolve();
  }
}

async function mount(
  resupplies = new FakeResupplies(),
  granted: readonly StaffPermission[] = [],
  bakehouse = new FakeBakehouse(),
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyProductionTab],
    providers: [
      provideRouter([]),
      { provide: ResuppliesToProduceService, useValue: resupplies },
      { provide: LiveStockAlertsService, useValue: new FakeAlerts() },
      { provide: BakehouseResuppliesService, useValue: bakehouse },
      { provide: PickupAddressesService, useValue: { list: () => Promise.resolve([]) } },
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

  /**
   * Régression (audit du 2026-11-03) : ce test cherchait une carte que
   * l'onglet ne monte plus, et passait quoi qu'il arrive. Il éprouve
   * désormais « Créer un réassort » et les brouillons, avec et sans droit.
   */
  it("n'offre la création d'un réassort qu'à qui tient son droit", async () => {
    const without = await mount();
    expect(without.el.querySelector('[data-resupply-create]')).toBeNull();
    expect(without.el.querySelector('app-bakehouse-drafts-section')).toBeNull();

    const granted = await mount(new FakeResupplies(), ['production_resupply:write']);
    expect(granted.el.querySelector('[data-resupply-create]')).not.toBeNull();
    expect(granted.el.querySelector('app-bakehouse-drafts-section')).not.toBeNull();
  });

  /**
   * Régression (audit du 2026-11-03) : changer de journée repassait l'onglet
   * en « chargement » et démontait la table ; la recherche était perdue.
   */
  it('garde la recherche et la vue quand la journée change', async () => {
    const resupplies = new FakeResupplies();
    const { fixture, el } = await mount(resupplies);
    fixture.componentInstance['query'].set('crois');

    fixture.componentInstance['shift'](1);
    fixture.detectChanges();
    expect(el.querySelector('fold-loading')).toBeNull();
    expect(el.querySelector('[data-resupply-production-table]')).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance['query']()).toBe('crois');
    expect(el.querySelector('[data-resupply-row="BAG"]')).toBeNull();
  });

  /**
   * Régression (audit du 2026-11-03) : « lancé depuis ce poste » vivait dans
   * la carte, que la relecture démontait ; « Lancer » revenait, et un second
   * clic était refusé.
   */
  it('ne repropose pas « Lancer » après la relecture qui suit un lancement', async () => {
    const resupplies = new FakeResupplies();
    resupplies.asap = true;
    const bakehouse = new FakeBakehouse();
    const { fixture, el } = await mount(resupplies, ['production_resupply:write'], bakehouse);

    el.querySelector<HTMLButtonElement>('[data-resupply-launch]')?.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(bakehouse.launched).toEqual(['r1']);
    expect(resupplies.asked).toHaveLength(2);
    expect(el.querySelector('[data-resupply-launch-row="r1"]')).not.toBeNull();
    expect(el.querySelector('[data-resupply-launch]')).toBeNull();
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

  /** Lot L2b-4 : le poids se dit en kilos, à part du total des pièces. */
  it('écrit « 1,25 kg » pour un article au poids, et ne l’ajoute pas aux pièces', async () => {
    const resupplies = new FakeResupplies();
    resupplies.weighed = true;
    const { el } = await mount(resupplies);

    expect(el.querySelector('[data-resupply-row="GRA"]')?.textContent).toContain('1,25 kg');
    expect(el.querySelector('[data-resupply-row="GRA"]')?.textContent).not.toContain('1250');
    expect(el.querySelector('[data-resupply-pieces]')?.textContent?.trim()).toBe('10');
    expect(el.querySelector('[data-resupply-weight]')?.textContent).toContain('1,25 kg');
  });

  describe('le passage de minuit sur un onglet resté ouvert', () => {
    afterEach(() => vi.useRealTimers());

    /**
     * Régression : le jour du poste était lu une fois à la construction ; après
     * minuit, « demain » restait celui de la veille et la flèche de retour
     * restait grisée sur le mauvais jour (audit réassort, 2026-11-02).
     */
    it('suit le jour réel de Paris, et arrête sa minuterie à la destruction', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      // 23 h 30 à Paris (UTC+1 en mars) : demain est le 11.
      vi.setSystemTime(new Date('2026-03-10T22:30:00.000Z'));
      const resupplies = new FakeResupplies();
      const { fixture } = await mount(resupplies);
      expect(resupplies.asked[0]).toBe('2026-03-11');
      expect(fixture.componentInstance['atTomorrow']()).toBe(true);

      vi.advanceTimersByTime(60 * 60_000);
      expect(fixture.componentInstance['atTomorrow']()).toBe(false);

      fixture.destroy();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
