import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PlaceSiteResupplyPayload,
  ResupplyArticleView,
  SiteResuppliesView,
  SiteResupplyView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { SiteResuppliesService } from '../site-resupplies.service';
import { ResupplyOrderCard } from './resupply-order-card';

/**
 * Commander le réassort (R1, 2026-10-21) : deux visées, un brouillon à
 * l'écran, « Passer le réassort », puis la liste du point, annulable. Les
 * journées viennent du serveur : aucune n'est calculée ici.
 */
const TODAY = '2026-01-02';
const TOMORROW = '2026-01-03';
const ARTICLES: readonly ResupplyArticleView[] = [
  { sku: 'CRO', name: 'Croissant' },
  { sku: 'PAC', name: 'Pain au chocolat' },
];

/** Un serveur en mémoire : passer et annuler changent la liste que la lecture rend. */
class FakeResupplies {
  readonly calls: string[] = [];
  resupplies: SiteResupplyView[] = [];
  orderUntil: string | null = '2026-01-02T17:00:00.000Z';
  refuse: Error | null = null;

  list(siteId: string): Promise<SiteResuppliesView> {
    this.calls.push(`list ${siteId}`);
    return Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TOMORROW,
      tomorrowOrderUntil: this.orderUntil,
      resupplies: this.resupplies,
    });
  }

  place(siteId: string, payload: PlaceSiteResupplyPayload): Promise<{ id: string }> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(`place ${siteId} ${JSON.stringify(payload)}`);
    const id = `rs${String(this.resupplies.length + 1)}`;
    this.resupplies = [
      {
        id,
        siteId,
        serviceDay: payload.target === 'tomorrow' ? TOMORROW : TODAY,
        target: payload.target,
        status: 'placed',
        lines: payload.lines.map((line) => ({
          ...line,
          label: ARTICLES.find((a) => a.sku === line.sku)?.name ?? line.sku,
        })),
        placedAt: '2026-01-02T15:00:00.000Z',
        placedBy: 'Lou',
        cancelledAt: null,
        cancelledBy: null,
      },
      ...this.resupplies,
    ];
    return Promise.resolve({ id });
  }

  cancel(siteId: string, id: string): Promise<void> {
    this.calls.push(`cancel ${siteId} ${id}`);
    this.resupplies = this.resupplies.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r));
    return Promise.resolve();
  }
}

async function settle(fixture: ComponentFixture<ResupplyOrderCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(
  permissions: readonly StaffPermission[],
  api = new FakeResupplies(),
): Promise<{ fixture: ComponentFixture<ResupplyOrderCard>; api: FakeResupplies }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyOrderCard],
    providers: [
      { provide: SiteResuppliesService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ResupplyOrderCard);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('articles', ARTICLES);
  await settle(fixture);
  return { fixture, api };
}

const root = (fixture: ComponentFixture<ResupplyOrderCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ResupplyOrderCard', () => {
  it('en lecture seule : la liste du point, ni visée ni annulation', async () => {
    const api = new FakeResupplies();
    await api.place('site_v', { target: 'asap', lines: [{ sku: 'CRO', quantity: 4 }] });
    const { fixture } = await mount(['handover_counter:read'], api);

    expect(root(fixture).querySelector('[data-resupply-target]')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-cancel]')).toBeNull();
    const today = root(fixture).querySelector(`[data-resupply-day="${TODAY}"]`);
    expect(today?.textContent).toContain('4 × Croissant');
    expect(today?.textContent).toContain('Au plus tôt');
    expect(root(fixture).querySelector(`[data-resupply-day="${TOMORROW}"]`)?.textContent).toContain(
      'Aucun réassort commandé',
    );
  });

  it('« Pour demain » annonce l’heure limite de Paris, puis passe le brouillon entier', async () => {
    const { fixture, api } = await mount(['handover_counter:read', 'handover_counter:write']);
    const card = fixture.componentInstance;

    card['pick']('tomorrow');
    await settle(fixture);
    expect(root(fixture).querySelector('[data-resupply-until]')?.textContent).toContain('18:00');

    card['pickedSku'].set('CRO');
    card['pickedQuantity'].set(24);
    card['addLine']();
    card['pickedSku'].set('PAC');
    card['pickedQuantity'].set(6);
    card['addLine']();
    expect(card['addableOptions']()).toEqual([]);
    await card['place']();
    await settle(fixture);

    expect(api.calls).toContain(
      'place site_v {"target":"tomorrow","lines":[{"sku":"CRO","quantity":24},{"sku":"PAC","quantity":6}]}',
    );
    expect(card['draft']()).toEqual([]);
    expect(card['target']()).toBeNull();
    expect(root(fixture).querySelector(`[data-resupply-day="${TOMORROW}"]`)?.textContent).toContain(
      '24 × Croissant',
    );
  });

  it('refuse d’ajouter une quantité nulle, et ne passe pas un brouillon vide', async () => {
    const { fixture } = await mount(['handover_counter:read', 'handover_counter:write']);
    const card = fixture.componentInstance;

    card['pick']('asap');
    card['pickedSku'].set('CRO');
    card['pickedQuantity'].set(0);
    expect(card['canAdd']()).toBe(false);
    expect(card['canPlace']()).toBe(false);
  });

  it('dit le refus du serveur et garde le brouillon', async () => {
    const api = new FakeResupplies();
    api.refuse = new Error('L’heure limite est passée');
    const { fixture } = await mount(['handover_counter:read', 'handover_counter:write'], api);
    const card = fixture.componentInstance;

    card['pick']('tomorrow');
    card['pickedSku'].set('CRO');
    card['pickedQuantity'].set(3);
    card['addLine']();
    await card['place']();
    await settle(fixture);

    expect(card['failure']()).not.toBeNull();
    expect(root(fixture).querySelector('fold-callout')).not.toBeNull();
    expect(card['draft']()).toHaveLength(1);
  });

  it('annule un réassort passé, et relit', async () => {
    const api = new FakeResupplies();
    await api.place('site_v', { target: 'asap', lines: [{ sku: 'CRO', quantity: 4 }] });
    const { fixture } = await mount(['handover_counter:read', 'handover_counter:write'], api);

    (root(fixture).querySelector('[data-resupply-cancel]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(api.calls).toContain('cancel site_v rs1');
    expect(root(fixture).querySelector('[data-resupply-cancel]')).toBeNull();
    expect(root(fixture).textContent).toContain('Annulé');
  });

  it('suit le point : un autre point relit sa liste et vide le brouillon', async () => {
    const { fixture, api } = await mount(['handover_counter:read', 'handover_counter:write']);
    const card = fixture.componentInstance;
    card['pick']('asap');

    fixture.componentRef.setInput('siteId', 'site_l');
    await settle(fixture);

    expect(api.calls).toEqual(['list site_v', 'list site_l']);
    expect(card['target']()).toBeNull();
  });
});
