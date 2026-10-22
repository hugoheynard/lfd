import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { SiteResuppliesView, SiteResupplyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { SiteResuppliesService } from './site-resupplies.service';
import { SiteResuppliesStore } from './site-resupplies.store';

/**
 * Le comptoir annule un réassort « au plus tôt » que le fournil a LANCÉ (R4a,
 * `reassort-boutiques/plan-au-plus-tot.md`) : le serveur refuse (409), et le
 * comptoir lit SON message — c'est lui qui nomme la sortie, pas l'écran.
 */
const REFUSAL =
  'Le fournil a déjà lancé ce réassort pour le 2026-01-03 : il est en fabrication et ne ' +
  "s'annule plus. Réceptionnez-le avec un écart (Réceptionner les réassorts), ou voyez le fournil.";

const LAUNCHED: SiteResupplyView = {
  id: 'r1',
  siteId: 'site_v',
  serviceDay: '2026-01-03',
  target: 'asap',
  origin: 'counter',
  name: null,
  status: 'placed',
  lines: [{ sku: 'CRO', label: 'Croissant', quantity: 6 }],
  placedAt: '2026-01-03T06:00:00.000Z',
  placedBy: 'Lou',
  cancelledAt: null,
  cancelledBy: null,
  arrivedAt: null,
  arrivedBy: null,
  launchedAt: '2026-01-03T06:30:00.000Z',
  launchedBy: 'Max',
  departedAt: null,
  departedBy: null,
};

class FakeService {
  readonly calls: string[] = [];
  list(siteId: string): Promise<SiteResuppliesView> {
    this.calls.push(`list ${siteId}`);
    return Promise.resolve({
      siteId,
      today: '2026-01-03',
      tomorrow: '2026-01-04',
      tomorrowOrderUntil: null,
      drafts: [],
      resupplies: [LAUNCHED],
      usedNames: [],
    });
  }
  cancel(siteId: string, resupplyId: string): Promise<void> {
    this.calls.push(`cancel ${siteId} ${resupplyId}`);
    return Promise.reject(new HttpErrorResponse({ status: 409, error: { message: REFUSAL } }));
  }
}

describe('SiteResuppliesStore — annuler un réassort lancé (R4a)', () => {
  it('affiche le refus du serveur tel quel, et relit la liste', async () => {
    const service = new FakeService();
    TestBed.configureTestingModule({
      providers: [SiteResuppliesStore, { provide: SiteResuppliesService, useValue: service }],
    });
    const store = TestBed.inject(SiteResuppliesStore);
    await store.load('site_v');

    const done = await store.cancel(LAUNCHED);

    expect(done).toBe(false);
    expect(store.failure()).toBe(REFUSAL);
    expect(service.calls).toEqual(['list site_v', 'cancel site_v r1', 'list site_v']);
    expect(store.view()?.resupplies[0]?.status).toBe('placed');
  });
});
