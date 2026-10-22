import { TestBed } from '@angular/core/testing';
import type { ResupplyProductionDayView, SiteResupplyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { ResupplyMountCard } from './resupply-mount-card';

/** « Monté » (lot R3e) : le second geste du signal « arrivé », pour un point servi sur place. */
function resupply(
  id: string,
  siteId: string,
  extra: Partial<SiteResupplyView> = {},
): SiteResupplyView {
  return {
    id,
    siteId,
    serviceDay: '2026-01-03',
    target: 'tomorrow',
    origin: 'counter',
    name: null,
    status: 'placed',
    lines: [
      { sku: 'CRO', label: 'Croissant', quantity: 10 },
      { sku: 'PAC', label: 'Pain au chocolat', quantity: 4 },
    ],
    placedAt: '2026-01-02T17:00:00.000Z',
    placedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    arrivedAt: null,
    arrivedBy: null,
    launchedAt: null,
    launchedBy: null,
    ...extra,
  };
}

const VIEW: ResupplyProductionDayView = {
  serviceDay: '2026-01-03',
  planStopped: false,
  transferSiteIds: ['village'],
  sites: [
    {
      siteId: 'labo',
      siteLabel: 'Le Labo',
      resupplies: [
        resupply('r1', 'labo', { name: 'Vitrine du matin' }),
        resupply('r2', 'labo', { arrivedAt: '2026-01-03T06:15:00.000Z', arrivedBy: 'Paul' }),
        resupply('r3', 'labo', { status: 'cancelled' }),
      ],
    },
    { siteId: 'village', siteLabel: 'Val Village', resupplies: [resupply('r4', 'village')] },
  ],
  totals: [],
  articles: [],
};

class FakeService {
  readonly calls: string[] = [];
  fail = false;
  mounted(siteId: string, resupplyId: string): Promise<void> {
    this.calls.push(`${siteId} ${resupplyId}`);
    return this.fail ? Promise.reject(new Error('refusé')) : Promise.resolve();
  }
}

function mount(canMount: boolean) {
  const service = new FakeService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyMountCard],
    providers: [{ provide: BakehouseResuppliesService, useValue: service }],
  });
  const fixture = TestBed.createComponent(ResupplyMountCard);
  fixture.componentRef.setInput('view', VIEW);
  fixture.componentRef.setInput('canMount', canMount);
  let mounted = 0;
  fixture.componentInstance.mounted.subscribe(() => (mounted += 1));
  fixture.detectChanges();
  return { fixture, service, root: fixture.nativeElement as HTMLElement, mounted: () => mounted };
}

describe('ResupplyMountCard', () => {
  it('ne liste que les réassorts envoyés des points servis sur place', () => {
    const { root } = mount(true);

    const rows = [...root.querySelectorAll('[data-resupply-mount-row]')].map((row) =>
      row.getAttribute('data-resupply-mount-row'),
    );
    expect(rows).toEqual(['r1', 'r2']);
    expect(root.querySelector('[data-resupply-mount-row="r1"]')?.textContent).toContain(
      'Vitrine du matin — Le Labo',
    );
    expect(root.querySelector('[data-resupply-mount-row="r1"]')?.textContent).toContain(
      '14 pièces',
    );
  });

  it('« Monté » sur un attendu prévient l’onglet ; un arrivé dit qui et quand', async () => {
    const { root, service, fixture, mounted } = mount(true);

    expect(root.querySelector('[data-resupply-mount-row="r2"] [data-resupply-mount]')).toBeNull();
    expect(root.querySelector('[data-resupply-mounted-by]')?.textContent).toContain(
      'Monté par Paul à 07:15',
    );
    root
      .querySelector<HTMLButtonElement>('[data-resupply-mount-row="r1"] [data-resupply-mount]')
      ?.click();
    await fixture.whenStable();

    expect(service.calls).toEqual(['labo r1']);
    expect(mounted()).toBe(1);
  });

  it('un refus reste affiché ; sans le droit, aucun bouton', async () => {
    const { root, service, fixture, mounted } = mount(true);
    service.fail = true;

    root.querySelector<HTMLButtonElement>('[data-resupply-mount]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('fold-callout')).not.toBeNull();
    expect(mounted()).toBe(0);
    expect(mount(false).root.querySelector('[data-resupply-mount]')).toBeNull();
  });
});
