import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import type {
  ResupplyArticleView,
  ResupplyReceiptView,
  SiteStockAlertsView,
  StaffPermission,
  StockAlertLevel,
  StockAlertView,
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
import { StockAlertsCard } from './stock-alerts-card/stock-alerts-card';

/**
 * Le réassort boutique (J1, 2026-10-21) : un point de retrait, une journée,
 * des lignes reçues ; le stock estimé est le reçu tant que le jour même sur
 * stock n'existe pas — aucune colonne « commandé ».
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
  { sku: 'CRO', name: 'Croissant' },
  { sku: 'PAC', name: 'Pain au chocolat' },
];

/** Un serveur en mémoire : les gestes changent la liste que la lecture rend. */
class FakeReceipts {
  readonly calls: string[] = [];
  lines: ResupplyReceiptView['lines'] = [];
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
      lines: this.lines,
      updatedAt: null,
      updatedBy: null,
    });
  }
  receive(_site: string, _day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`receive ${sku} ${String(quantity)}`);
    const label = ARTICLES.find((a) => a.sku === sku)?.name ?? sku;
    this.lines = [
      ...this.lines,
      { sku, label, receivedQuantity: quantity, estimatedStock: quantity },
    ];
    return Promise.resolve();
  }
  correct(_site: string, _day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${sku} ${String(quantity)}`);
    this.lines = this.lines.map((l) =>
      l.sku === sku ? { ...l, receivedQuantity: quantity, estimatedStock: quantity } : l,
    );
    return Promise.resolve();
  }
  withdraw(_site: string, _day: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${sku}`);
    this.lines = this.lines.filter((l) => l.sku !== sku);
    return Promise.resolve();
  }
}

/** La commande au fournil (R1) a sa propre suite : ici, une liste vide suffit. */
const NO_RESUPPLIES = {
  list: (siteId: string) =>
    Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TODAY,
      tomorrowOrderUntil: null,
      resupplies: [],
    }),
};

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
): Promise<{
  fixture: ComponentFixture<ReassortBoutiquePage>;
  api: FakeReceipts;
  band: ReturnType<typeof counter>;
  alerts: FakeAlerts;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReassortBoutiquePage],
    providers: [
      { provide: ResupplyReceiptsService, useValue: api },
      { provide: SiteResuppliesService, useValue: NO_RESUPPLIES },
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
  return { fixture, api, band, alerts };
}

const root = (fixture: ComponentFixture<ReassortBoutiquePage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ReassortBoutiquePage', () => {
  it('lit le point ouvert dans la bande pour aujourd’hui, et dit le vide', async () => {
    const { fixture, api } = await mount(['handover_counter:read']);

    expect(api.calls).toEqual([`read site_v ${parisToday()}`]);
    expect(root(fixture).textContent).toContain('Rien de reçu pour cette journée');
    expect(root(fixture).querySelector('[data-resupply-add]')).toBeNull();
  });

  it('montre le reçu et le stock estimé, sans colonne « commandé »', async () => {
    const api = new FakeReceipts();
    api.lines = [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 12, estimatedStock: 12 }];
    const { fixture } = await mount(['handover_counter:read'], api);

    const row = root(fixture).querySelector('[data-resupply-line="CRO"]');
    expect(row?.textContent).toContain('Croissant');
    expect(row?.querySelector('[data-resupply-estimated]')?.textContent?.trim()).toBe('12');
    expect(root(fixture).querySelector('thead')?.textContent).not.toContain('ommandé');
    expect(root(fixture).textContent).toContain('le stock estimé est le reçu');
  });

  it('ajoute, corrige et retire une ligne sous le droit d’écriture, en relisant après chaque geste', async () => {
    const { fixture, api } = await mount(['handover_counter:read', 'handover_counter:write']);
    const page = fixture.componentInstance;

    page['pickedSku'].set('CRO');
    page['pickedQuantity'].set(12);
    await page['add']();
    await settle(fixture);
    expect(root(fixture).querySelector('[data-resupply-line="CRO"]')).not.toBeNull();
    expect(page['pickedSku']()).toBeNull();

    const line = api.lines[0];
    if (line === undefined) {
      throw new Error('la ligne ajoutée manque');
    }
    page['setDraft']('CRO', 10);
    await page['correct'](line);
    await page['withdraw'](line);
    await settle(fixture);

    expect(api.calls.filter((c) => !c.startsWith('read'))).toEqual([
      'receive CRO 12',
      'correct CRO 10',
      'withdraw CRO',
    ]);
    expect(root(fixture).querySelector('[data-resupply-line="CRO"]')).toBeNull();
  });

  it('ne propose plus un article déjà sur la liste', async () => {
    const api = new FakeReceipts();
    api.lines = [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 1, estimatedStock: 1 }];
    const { fixture } = await mount(['handover_counter:read', 'handover_counter:write'], api);

    expect(fixture.componentInstance['addableOptions']().map((o) => o.value)).toEqual(['PAC']);
  });

  it('suit le point de la bande : un changement relit la liste, et le titre le nomme', async () => {
    const { fixture, api, band } = await mount(['handover_counter:read']);
    const title = (): string => fixture.componentInstance['title']();

    expect(title()).toBe('Réassort Village');
    expect(root(fixture).querySelector('fold-listbox')).toBeNull();

    band.activePlace.set(LABO);
    await settle(fixture);

    expect(api.calls).toEqual([`read site_v ${parisToday()}`, `read site_l ${parisToday()}`]);
    expect(title()).toBe('Réassort Labo');
    expect(root(fixture).textContent).toContain('Réassort Labo');
  });

  it('suit la journée de la bande : ses flèches relisent la liste', async () => {
    const { fixture, api, band } = await mount(['handover_counter:read']);

    band.day.set('2026-01-03');
    await settle(fixture);

    expect(api.calls).toEqual([`read site_v ${TODAY}`, 'read site_v 2026-01-03']);
    expect(root(fixture).querySelector('input[type="date"]')).toBeNull();
  });

  it('sans point ouvert, s’appelle « Réassort » et invite à en choisir un dans le bandeau', async () => {
    const { fixture, api } = await mount(
      ['handover_counter:read'],
      new FakeReceipts(),
      counter(null),
    );

    expect(fixture.componentInstance['title']()).toBe('Réassort');
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
});

describe('ReassortBoutiquePage — ruptures et stocks faibles (R1b)', () => {
  const WRITE: readonly StaffPermission[] = ['handover_counter:read', 'handover_counter:write'];

  function click(fixture: ComponentFixture<ReassortBoutiquePage>, selector: string): void {
    const button = root(fixture).querySelector<HTMLButtonElement>(selector);
    if (button === null) {
      throw new Error(`bouton absent : ${selector}`);
    }
    button.click();
  }

  it('dit en tête les alertes vivantes du point, et qu’elles n’agissent pas sur la boutique', async () => {
    const alerts = new FakeAlerts();
    await alerts.declare('site_v', 'CRO', 'out_of_stock');
    alerts.calls.length = 0;
    const { fixture } = await mount(
      ['handover_counter:read'],
      new FakeReceipts(),
      counter(),
      alerts,
    );

    expect(alerts.calls).toEqual(['list site_v']);
    const card = root(fixture).querySelector('[data-stock-alerts]');
    expect(card?.querySelector('[data-stock-alert="CRO"]')?.textContent).toContain('Rupture');
    expect(card?.querySelector('[data-stock-alert="CRO"]')?.textContent).toContain('Croissant');
    expect(card?.querySelector('[data-stock-alerts-no-effect]')?.textContent).toContain(
      'Sans effet sur la boutique',
    );
    // Lecture seule : aucun geste.
    expect(root(fixture).querySelector('[data-stock-alert-actions]')).toBeNull();
    expect(root(fixture).querySelector('[data-stock-alerts-declare]')).toBeNull();
  });

  it('déclare depuis le catalogue (combobox), puis redéclare et lève', async () => {
    const { fixture, alerts } = await mount(WRITE);
    const card: unknown = fixture.debugElement.query(
      By.css('app-stock-alerts-card'),
    ).componentInstance;
    if (!(card instanceof StockAlertsCard)) {
      throw new Error('la carte des alertes manque');
    }
    card['pickedSku'].set('PAC');
    await settle(fixture);

    click(fixture, '[data-stock-alerts-declare] [data-stock-alert-declare="low"]');
    await settle(fixture);
    expect(root(fixture).querySelector('[data-stock-alert="PAC"]')?.textContent).toContain(
      'Stock faible',
    );

    click(fixture, '[data-stock-alert="PAC"] [data-stock-alert-declare="out_of_stock"]');
    await settle(fixture);
    click(fixture, '[data-stock-alert="PAC"] [data-stock-alert-lift]');
    await settle(fixture);

    expect(alerts.calls.filter((c) => !c.startsWith('list'))).toEqual([
      'declare PAC low',
      'declare PAC out_of_stock',
      'lift alert_PAC',
    ]);
    expect(root(fixture).querySelector('[data-stock-alert="PAC"]')).toBeNull();
  });

  it('déclare depuis une ligne reçue, et relit les alertes après une réception', async () => {
    const api = new FakeReceipts();
    api.lines = [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 2, estimatedStock: 2 }];
    const { fixture, alerts } = await mount(WRITE, api);

    click(fixture, '[data-resupply-line="CRO"] [data-stock-alert-declare="out_of_stock"]');
    await settle(fixture);
    expect(alerts.calls).toContain('declare CRO out_of_stock');
    expect(
      root(fixture).querySelector('[data-resupply-line="CRO"] [data-stock-alert-lift]'),
    ).not.toBeNull();

    const before = alerts.calls.filter((c) => c.startsWith('list')).length;
    const page = fixture.componentInstance;
    page['pickedSku'].set('PAC');
    page['pickedQuantity'].set(6);
    await page['add']();
    expect(alerts.calls.filter((c) => c.startsWith('list')).length).toBe(before + 1);
  });
});
