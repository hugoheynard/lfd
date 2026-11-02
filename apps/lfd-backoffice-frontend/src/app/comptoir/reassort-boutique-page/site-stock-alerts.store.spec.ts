import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FakeAlerts } from './resupply-stock.testing';
import { SiteStockAlertsService } from './site-stock-alerts.service';
import { SiteStockAlertsStore } from './site-stock-alerts.store';

describe('SiteStockAlertsStore', () => {
  /**
   * Régression (audit du 2026-11-03) : un second clic d'état posé pendant
   * qu'un premier s'écrivait était jeté en silence. Il est mis en file.
   */
  it('écrit les deux gestes posés coup sur coup, dans l’ordre', async () => {
    const alerts = new FakeAlerts();
    TestBed.configureTestingModule({
      providers: [SiteStockAlertsStore, { provide: SiteStockAlertsService, useValue: alerts }],
    });
    const store = TestBed.inject(SiteStockAlertsStore);
    await store.load('site_v');

    await Promise.all([store.declare('CRO', 'low'), store.declare('PAC', 'out_of_stock')]);

    expect(alerts.calls).toEqual(['declare CRO low', 'declare PAC out_of_stock']);
    expect(store.alerts().map((alert) => alert.sku)).toEqual(['PAC', 'CRO']);
    expect(store.pending()).toBe(false);
  });
});
