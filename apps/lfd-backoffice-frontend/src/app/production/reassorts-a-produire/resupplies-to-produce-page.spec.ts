import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ResuppliesToProduceView, SiteResupplyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

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

async function mount(
  api = new FakeService(),
): Promise<{ fixture: ComponentFixture<ResuppliesToProducePage>; root: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResuppliesToProducePage],
    providers: [{ provide: ResuppliesToProduceService, useValue: api }],
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
