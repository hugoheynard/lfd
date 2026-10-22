import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyReceiptView,
  ResupplyReceptionView,
  SiteResuppliesView,
  SiteStockAlertsView,
  StaffPermission,
  StockAlertLevel,
  StockAlertView,
  UnorderedReceiptLineView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import type { CounterPlace } from '../../handover-shop/handover-queue';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { parisToday } from '../../shared/paris-today';
import { ReassortBoutiquePage } from './reassort-boutique-page';
import { ResupplyReceiptsService } from './resupply-receipts.service';
import { SiteResuppliesService } from './site-resupplies.service';
import { SiteStockAlertsService } from './site-stock-alerts.service';

/**
 * Le réassort boutique (J1, refait au lot R2 le 2026-10-21) : un point de
 * retrait, une journée, un reçu par réassort réceptionné d'un geste, le
 * réassort sans commande, et le stock estimé, somme des reçus — aucune
 * colonne « commandé ».
 */
const TODAY = parisToday();
const VILLAGE: CounterPlace = { id: 'site_v', label: 'Village' };
const LABO: CounterPlace = { id: 'site_l', label: 'Labo' };

/** La bande du comptoir, doublée : le point ouvert et la lecture des sites. */
function counter(initial: CounterPlace | null = VILLAGE) {
  return {
    activePlace: signal<CounterPlace | null>(initial),
    placesLoaded: signal(true),
    day: signal(TODAY),
  };
}

const ARTICLES: readonly ResupplyArticleView[] = [
  { sku: 'CRO', name: 'Croissant', categoryId: 'fam_morning', categoryName: 'Viennoiseries' },
  {
    sku: 'PAC',
    name: 'Pain au chocolat',
    categoryId: 'fam_morning',
    categoryName: 'Viennoiseries',
  },
];

/**
 * Un serveur en mémoire : les gestes changent ce que la lecture rend. Le
 * stock est la somme des reçus, comme côté serveur (lot R2).
 */
class FakeReceipts {
  readonly calls: string[] = [];
  unordered: UnorderedReceiptLineView[] = [];
  receptions: ResupplyReceptionView[] = [];
  failRead = false;

  articles(): Promise<readonly ResupplyArticleView[]> {
    return Promise.resolve(ARTICLES);
  }
  read(siteId: string, day: string): Promise<ResupplyReceiptView> {
    this.calls.push(`read ${siteId} ${day}`);
    if (this.failRead) {
      return Promise.reject(new Error('hors ligne'));
    }
    return Promise.resolve({
      siteId,
      serviceDay: day,
      receptions: this.receptions,
      unordered: { lines: this.unordered, updatedAt: null, updatedBy: null },
      stock: this.stock(),
    });
  }
  receiveResupply(_site: string, resupplyId: string): Promise<void> {
    this.calls.push(`receive-resupply ${resupplyId}`);
    this.receptions = this.receptions.map((r) =>
      r.resupplyId === resupplyId
        ? {
            ...r,
            status: 'received',
            receivedAt: '2026-01-02T08:30:00.000Z',
            receivedBy: 'Lou',
            lines: r.lines.map((l) => ({ ...l, receivedQuantity: l.expectedQuantity })),
          }
        : r,
    );
    return Promise.resolve();
  }
  correctReceived(_site: string, resupplyId: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct-received ${resupplyId} ${sku} ${String(quantity)}`);
    this.receptions = this.receptions.map((r) =>
      r.resupplyId === resupplyId
        ? {
            ...r,
            lines: r.lines.map((l) => (l.sku === sku ? { ...l, receivedQuantity: quantity } : l)),
          }
        : r,
    );
    return Promise.resolve();
  }
  receive(_site: string, _day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`receive ${sku} ${String(quantity)}`);
    const label = ARTICLES.find((a) => a.sku === sku)?.name ?? sku;
    this.unordered = [...this.unordered, { sku, label, receivedQuantity: quantity }];
    return Promise.resolve();
  }
  correct(_site: string, _day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${sku} ${String(quantity)}`);
    this.unordered = this.unordered.map((l) =>
      l.sku === sku ? { ...l, receivedQuantity: quantity } : l,
    );
    return Promise.resolve();
  }
  withdraw(_site: string, _day: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${sku}`);
    this.unordered = this.unordered.filter((l) => l.sku !== sku);
    return Promise.resolve();
  }

  private stock(): ResupplyReceiptLineView[] {
    const totals = new Map<string, ResupplyReceiptLineView>();
    const received = [
      ...this.receptions.flatMap((r) =>
        r.lines.flatMap((l) =>
          l.receivedQuantity === null ? [] : [{ ...l, receivedQuantity: l.receivedQuantity }],
        ),
      ),
      ...this.unordered,
    ];
    for (const line of received) {
      const sum = (totals.get(line.sku)?.receivedQuantity ?? 0) + line.receivedQuantity;
      totals.set(line.sku, {
        sku: line.sku,
        label: line.label,
        receivedQuantity: sum,
        estimatedStock: sum,
      });
    }
    return [...totals.values()];
  }
}

/** Un réassort envoyé, attendu. */
function expected(resupplyId: string, quantity: number): ResupplyReceptionView {
  return {
    resupplyId,
    target: 'asap',
    origin: 'counter',
    name: null,
    placedAt: '2026-01-02T07:00:00.000Z',
    placedBy: 'Max',
    status: 'expected',
    arrivedAt: null,
    arrivedBy: null,
    launchedAt: null,
    launchedBy: null,
    departedAt: null,
    departedBy: null,
    receivedAt: null,
    receivedBy: null,
    lines: [{ sku: 'CRO', label: 'Croissant', expectedQuantity: quantity, receivedQuantity: null }],
  };
}

/**
 * La commande au fournil (R1, R1c) a sa propre suite : ici, une demande en
 * cours qui retient ce qu'on y ajoute, pour la proposition des alertes.
 */
class FakeResupplies {
  readonly added: string[] = [];

  list(siteId: string): Promise<SiteResuppliesView> {
    return Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TODAY,
      tomorrowOrderUntil: null,
      drafts:
        this.added.length === 0
          ? []
          : [
              {
                id: 'draft_asap',
                target: 'asap',
                serviceDay: TODAY,
                version: this.added.length,
                name: null,
                lines: this.added.map((sku) => ({ sku, label: sku, quantity: 1 })),
              },
            ],
      resupplies: [],
      usedNames: [],
    });
  }

  addLine(siteId: string, target: string, sku: string, quantity: number): Promise<{ id: string }> {
    this.added.push(sku);
    this.calls.push(`add ${siteId} ${target} ${sku} ${String(quantity)}`);
    return Promise.resolve({ id: 'draft_asap' });
  }

  readonly calls: string[] = [];
}

/**
 * Les alertes de stock (R1b) en mémoire : déclarer redéclare la vivante,
 * lever la retire, et une réception de l'article la lève comme le serveur.
 */
class FakeAlerts {
  readonly calls: string[] = [];
  alerts: StockAlertView[] = [];

  list(siteId: string): Promise<SiteStockAlertsView> {
    this.calls.push(`list ${siteId}`);
    return Promise.resolve({ siteId, alerts: this.alerts });
  }
  declare(siteId: string, sku: string, level: StockAlertLevel): Promise<void> {
    this.calls.push(`declare ${sku} ${level}`);
    const label = ARTICLES.find((a) => a.sku === sku)?.name ?? sku;
    this.alerts = [
      {
        id: `alert_${sku}`,
        siteId,
        sku,
        label,
        level,
        declaredAt: '2026-01-02T08:30:00.000Z',
        declaredBy: 'Lou',
      },
      ...this.alerts.filter((a) => a.sku !== sku),
    ];
    return Promise.resolve();
  }
  lift(_siteId: string, alertId: string): Promise<void> {
    this.calls.push(`lift ${alertId}`);
    this.alerts = this.alerts.filter((a) => a.id !== alertId);
    return Promise.resolve();
  }
}

/** Le chargement enchaîne deux lectures : on laisse passer les tâches en attente. */
async function settle(fixture: ComponentFixture<ReassortBoutiquePage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(
  permissions: readonly StaffPermission[],
  api = new FakeReceipts(),
  band = counter(),
  alerts = new FakeAlerts(),
  resupplies = new FakeResupplies(),
): Promise<{
  fixture: ComponentFixture<ReassortBoutiquePage>;
  api: FakeReceipts;
  band: ReturnType<typeof counter>;
  alerts: FakeAlerts;
  resupplies: FakeResupplies;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReassortBoutiquePage],
    providers: [
      { provide: ResupplyReceiptsService, useValue: api },
      { provide: SiteResuppliesService, useValue: resupplies },
      { provide: SiteStockAlertsService, useValue: alerts },
      { provide: HandoverQueueStore, useValue: band },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ReassortBoutiquePage);
  await settle(fixture);
  return { fixture, api, band, alerts, resupplies };
}

const root = (fixture: ComponentFixture<ReassortBoutiquePage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function clickOn(fixture: ComponentFixture<ReassortBoutiquePage>, selector: string): void {
  const button = root(fixture).querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`bouton absent : ${selector}`);
  }
  button.click();
}

describe('ReassortBoutiquePage', () => {
  it('lit le point ouvert dans la bande pour aujourd’hui, et montre tous les produits', async () => {
    const { fixture, api } = await mount(['handover_counter:read']);

    expect(api.calls).toEqual([`read site_v ${parisToday()}`]);
    expect(root(fixture).querySelectorAll('[data-resupply-row]').length).toBe(ARTICLES.length);
    // Rien à réceptionner : pas de carte en tête.
    expect(root(fixture).querySelector('app-resupply-receptions-card')).toBeNull();
  });

  it('montre le stock du jour, somme des reçus, sans colonne « commandé »', async () => {
    const api = new FakeReceipts();
    api.unordered = [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 2 }];
    api.receptions = [{ ...expected('r1', 12) }];
    await api.receiveResupply('site_v', 'r1');
    const { fixture } = await mount(['handover_counter:read'], api);

    const row = root(fixture).querySelector('[data-resupply-row="CRO"]');
    expect(row?.textContent).toContain('Croissant');
    expect(row?.querySelector('[data-resupply-stock]')?.textContent?.trim()).toBe('14');
    expect(root(fixture).querySelector('thead')?.textContent).not.toContain('ommandé');
  });

  it('met les réassorts à réceptionner EN TÊTE, et réceptionne d’un geste', async () => {
    const api = new FakeReceipts();
    api.receptions = [expected('r1', 12)];
    const { fixture } = await mount(['handover_counter:read', 'handover_counter:write'], api);
    const cards = root(fixture).querySelector('.cards');

    expect(cards?.firstElementChild?.tagName.toLowerCase()).toBe('app-resupply-receptions-card');
    clickOn(fixture, '[data-resupply-reception="r1"] [data-resupply-receive]');
    await settle(fixture);

    expect(api.calls.filter((c) => !c.startsWith('read'))).toEqual(['receive-resupply r1']);
    expect(
      root(fixture).querySelector('[data-resupply-row="CRO"] [data-resupply-stock]')?.textContent,
    ).toContain('12');
  });

  it('en lecture seule, ni « Réceptionner » ni geste sur la table', async () => {
    const api = new FakeReceipts();
    api.receptions = [expected('r1', 12)];
    const { fixture } = await mount(['handover_counter:read'], api);

    expect(root(fixture).querySelector('[data-resupply-receive]')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-state]')).toBeNull();
  });

  it('suit le point de la bande, sans titre à elle : l’onglet le nomme déjà', async () => {
    const { fixture, api, band } = await mount(['handover_counter:read']);

    band.activePlace.set(LABO);
    await settle(fixture);

    expect(api.calls).toEqual([`read site_v ${parisToday()}`, `read site_l ${parisToday()}`]);
    expect(root(fixture).textContent).not.toContain('Réassort Labo');
    expect(root(fixture).querySelector('fold-listbox')).toBeNull();
  });

  it('suit la journée de la bande : ses flèches relisent la liste', async () => {
    const { fixture, api, band } = await mount(['handover_counter:read']);

    band.day.set('2026-01-03');
    await settle(fixture);

    expect(api.calls).toEqual([`read site_v ${TODAY}`, 'read site_v 2026-01-03']);
    expect(root(fixture).querySelector('input[type="date"]')).toBeNull();
  });

  it('sans point ouvert, invite à en choisir un dans le bandeau', async () => {
    const { fixture, api } = await mount(
      ['handover_counter:read'],
      new FakeReceipts(),
      counter(null),
    );

    expect(api.calls).toEqual([]);
    expect(root(fixture).querySelector('[data-resupply-no-place]')?.textContent).toContain(
      'bandeau du comptoir',
    );
  });

  it('dit l’échec de chargement par un état fold', async () => {
    const api = new FakeReceipts();
    api.failRead = true;
    const { fixture } = await mount(['handover_counter:read'], api);

    expect(root(fixture).querySelector('fold-empty-state')?.textContent).toContain(
      'Impossible de charger le réassort',
    );
  });

  it('relit les alertes et la demande en cours avec la liste, et après une réception', async () => {
    const api = new FakeReceipts();
    api.receptions = [expected('r1', 12)];
    const alerts = new FakeAlerts();
    await alerts.declare('site_v', 'PAC', 'out_of_stock');
    alerts.calls.length = 0;
    const { fixture } = await mount(
      ['handover_counter:read', 'handover_counter:write'],
      api,
      counter(),
      alerts,
    );

    expect(alerts.calls).toEqual(['list site_v']);
    expect(
      root(fixture).querySelector('[data-resupply-row]')?.getAttribute('data-resupply-row'),
    ).toBe('PAC');
    clickOn(fixture, '[data-resupply-reception="r1"] [data-resupply-receive]');
    await settle(fixture);
    expect(alerts.calls).toEqual(['list site_v', 'list site_v']);
  });
});
