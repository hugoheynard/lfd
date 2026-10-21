import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyTarget,
  SiteResuppliesView,
  SiteStockAlertsView,
  StockAlertLevel,
  StockAlertView,
  UnorderedReceiptLineView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { parisToday } from '../../../shared/paris-today';
import { ResupplyReceiptsService } from '../resupply-receipts.service';
import { SiteResuppliesService } from '../site-resupplies.service';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { SiteStockAlertsService } from '../site-stock-alerts.service';
import { SiteStockAlertsStore } from '../site-stock-alerts.store';
import { ResupplyStockTable } from './resupply-stock-table';

/**
 * La table du réassort (R1e, 2026-10-21) : tous les produits, l'état en un
 * clic, la demande en cours saisie dans la case, le tri « ce qui manque
 * d'abord », et le reçu sans commande dans le menu de la ligne.
 */
const TODAY = parisToday();
const ARTICLES: readonly ResupplyArticleView[] = [
  { sku: 'BAG', name: 'Baguette', categoryId: 'fam_bread', categoryName: 'Pains' },
  { sku: 'CRO', name: 'Croissant', categoryId: 'fam_morning', categoryName: 'Viennoiseries' },
  {
    sku: 'PAC',
    name: 'Pain au chocolat',
    categoryId: 'fam_morning',
    categoryName: 'Viennoiseries',
  },
];

/** La demande en cours, en mémoire : une version par geste, comme le serveur. */
class FakeResupplies {
  readonly calls: string[] = [];
  private readonly lines = new Map<ResupplyTarget, Map<string, number>>([
    ['asap', new Map()],
    ['tomorrow', new Map()],
  ]);
  private version = 0;

  list(siteId: string): Promise<SiteResuppliesView> {
    const drafts = (['asap', 'tomorrow'] as const).flatMap((target) => {
      const lines = [...(this.lines.get(target) ?? new Map<string, number>())];
      return lines.length === 0
        ? []
        : [
            {
              id: `draft_${target}`,
              target,
              serviceDay: TODAY,
              version: this.version,
              lines: lines.map(([sku, quantity]) => ({ sku, label: sku, quantity })),
            },
          ];
    });
    return Promise.resolve({
      siteId,
      today: TODAY,
      tomorrow: TODAY,
      tomorrowOrderUntil: null,
      drafts,
      resupplies: [],
    });
  }
  addLine(
    _s: string,
    target: ResupplyTarget,
    sku: string,
    quantity: number,
  ): Promise<{ id: string }> {
    this.calls.push(`add ${target} ${sku} ${String(quantity)}`);
    const lines = this.lines.get(target);
    lines?.set(sku, (lines.get(sku) ?? 0) + quantity);
    this.version += 1;
    return Promise.resolve({ id: `draft_${target}` });
  }
  correctLine(_s: string, id: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${id} ${sku} ${String(quantity)}`);
    this.lines.get(id === 'draft_asap' ? 'asap' : 'tomorrow')?.set(sku, quantity);
    this.version += 1;
    return Promise.resolve();
  }
  withdrawLine(_s: string, id: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${id} ${sku}`);
    this.lines.get(id === 'draft_asap' ? 'asap' : 'tomorrow')?.delete(sku);
    this.version += 1;
    return Promise.resolve();
  }
  send(_s: string, id: string): Promise<void> {
    this.calls.push(`send ${id}`);
    this.lines.get(id === 'draft_asap' ? 'asap' : 'tomorrow')?.clear();
    this.version += 1;
    return Promise.resolve();
  }
}

class FakeAlerts {
  readonly calls: string[] = [];
  alerts: StockAlertView[] = [];

  list(siteId: string): Promise<SiteStockAlertsView> {
    return Promise.resolve({ siteId, alerts: this.alerts });
  }
  declare(siteId: string, sku: string, level: StockAlertLevel): Promise<void> {
    this.calls.push(`declare ${sku} ${level}`);
    this.alerts = [
      {
        id: `alert_${sku}`,
        siteId,
        sku,
        label: sku,
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

class FakeReceipts {
  readonly calls: string[] = [];
  receive(_s: string, _d: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`receive ${sku} ${String(quantity)}`);
    return Promise.resolve();
  }
  correct(_s: string, _d: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`correct ${sku} ${String(quantity)}`);
    return Promise.resolve();
  }
  withdraw(_s: string, _d: string, sku: string): Promise<void> {
    this.calls.push(`withdraw ${sku}`);
    return Promise.resolve();
  }
}

interface Mounted {
  readonly fixture: ComponentFixture<ResupplyStockTable>;
  readonly table: ResupplyStockTable;
  readonly resupplies: FakeResupplies;
  readonly alerts: FakeAlerts;
  readonly receipts: FakeReceipts;
}

async function settle(fixture: ComponentFixture<ResupplyStockTable>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(
  options: {
    readonly canWrite?: boolean;
    readonly stock?: readonly ResupplyReceiptLineView[];
    readonly unordered?: readonly UnorderedReceiptLineView[];
    readonly alerts?: FakeAlerts;
  } = {},
): Promise<Mounted> {
  const resupplies = new FakeResupplies();
  const alerts = options.alerts ?? new FakeAlerts();
  const receipts = new FakeReceipts();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyStockTable],
    providers: [
      SiteResuppliesStore,
      SiteStockAlertsStore,
      { provide: SiteResuppliesService, useValue: resupplies },
      { provide: SiteStockAlertsService, useValue: alerts },
      { provide: ResupplyReceiptsService, useValue: receipts },
    ],
  });
  await TestBed.inject(SiteResuppliesStore).load('site_v');
  await TestBed.inject(SiteStockAlertsStore).load('site_v');
  const fixture = TestBed.createComponent(ResupplyStockTable);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('day', TODAY);
  fixture.componentRef.setInput('articles', ARTICLES);
  fixture.componentRef.setInput('stock', options.stock ?? []);
  fixture.componentRef.setInput('unordered', options.unordered ?? []);
  fixture.componentRef.setInput('canWrite', options.canWrite ?? true);
  await settle(fixture);
  return { fixture, table: fixture.componentInstance, resupplies, alerts, receipts };
}

const root = (fixture: ComponentFixture<ResupplyStockTable>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function rowOf(table: ResupplyStockTable, sku: string) {
  const row = table['rows']().find((r) => r.sku === sku);
  if (row === undefined) {
    throw new Error(`ligne absente : ${sku}`);
  }
  return row;
}

const order = (fixture: ComponentFixture<ResupplyStockTable>): string[] =>
  [...root(fixture).querySelectorAll('[data-resupply-row]')].map(
    (tr) => tr.getAttribute('data-resupply-row') ?? '',
  );

describe('ResupplyStockTable', () => {
  it('montre tous les produits, leur stock du jour (somme des reçus) et un article reçu hors catalogue', async () => {
    const { fixture } = await mount({
      stock: [
        { sku: 'CRO', label: 'Croissant', receivedQuantity: 14, estimatedStock: 14 },
        { sku: 'OLD', label: 'Ancien', receivedQuantity: 3, estimatedStock: 3 },
      ],
    });

    expect(order(fixture)).toEqual(['BAG', 'CRO', 'PAC', 'OLD']);
    const stockOf = (sku: string): string | undefined =>
      root(fixture)
        .querySelector(`[data-resupply-row="${sku}"] [data-resupply-stock]`)
        ?.textContent?.trim();
    expect(stockOf('CRO')).toBe('14');
    expect(stockOf('BAG')).toBe('0');
  });

  it('un clic déclare une rupture, la ligne passe en rouge et en tête ; OK la lève', async () => {
    const { fixture, table, alerts } = await mount();

    await table['setState'](rowOf(table, 'PAC'), 'out_of_stock');
    await settle(fixture);
    expect(order(fixture)[0]).toBe('PAC');
    expect(root(fixture).querySelector('[data-resupply-row="PAC"]')?.classList).toContain('out');

    await table['setState'](rowOf(table, 'PAC'), 'low');
    await settle(fixture);
    expect(root(fixture).querySelector('[data-resupply-row="PAC"]')?.classList).toContain('low');

    await table['setState'](rowOf(table, 'PAC'), 'ok');
    await settle(fixture);
    expect(alerts.calls).toEqual(['declare PAC out_of_stock', 'declare PAC low', 'lift alert_PAC']);
    expect(order(fixture)).toEqual(['BAG', 'CRO', 'PAC']);
  });

  it('trie : alertes, puis demandés, puis le reste', async () => {
    const alerts = new FakeAlerts();
    await alerts.declare('site_v', 'PAC', 'low');
    const { fixture, table } = await mount({ alerts });

    await table['step']('tomorrow', rowOf(table, 'CRO'), 5);
    await settle(fixture);

    expect(order(fixture)).toEqual(['PAC', 'CRO', 'BAG']);
  });

  it('la case écrit la demande en cours : ajoute, corrige, retire ; les pas s’ajoutent', async () => {
    const { fixture, table, resupplies } = await mount();

    table['setQuantity']('asap', rowOf(table, 'CRO'), 6);
    await table['commit']('asap', rowOf(table, 'CRO'));
    await settle(fixture);
    await table['step']('asap', rowOf(table, 'CRO'), 10);
    await settle(fixture);
    expect(rowOf(table, 'CRO').asap).toBe(16);

    table['setQuantity']('asap', rowOf(table, 'CRO'), 4);
    await table['commit']('asap', rowOf(table, 'CRO'));
    await settle(fixture);
    table['setQuantity']('asap', rowOf(table, 'CRO'), null);
    await table['commit']('asap', rowOf(table, 'CRO'));
    await settle(fixture);

    expect(resupplies.calls).toEqual([
      'add asap CRO 6',
      'add asap CRO 10',
      'correct draft_asap CRO 4',
      'withdraw draft_asap CRO',
    ]);
  });

  it('« Envoyer au plus tôt (N) » envoie la demande de la visée', async () => {
    const { fixture, table, resupplies } = await mount();

    await table['step']('asap', rowOf(table, 'CRO'), 1);
    await table['step']('asap', rowOf(table, 'PAC'), 5);
    await settle(fixture);
    const button = root(fixture).querySelector<HTMLButtonElement>('[data-resupply-send-asap]');
    expect(button?.textContent).toContain('Envoyer au plus tôt (2)');
    expect(
      root(fixture).querySelector<HTMLButtonElement>('[data-resupply-send-tomorrow]')?.disabled,
    ).toBe(true);

    button?.click();
    await settle(fixture);
    expect(resupplies.calls.at(-1)).toBe('send draft_asap');
  });

  it('le reçu sans commande se saisit depuis la ligne, et la page relit', async () => {
    const { fixture, table, receipts } = await mount();
    let changed = 0;
    table.changed.subscribe(() => (changed += 1));

    table['openUnordered'](rowOf(table, 'BAG'));
    table['unorderedQuantity'].set(8);
    await table['saveUnordered'](rowOf(table, 'BAG'));
    await settle(fixture);

    expect(receipts.calls).toEqual(['receive BAG 8']);
    expect(changed).toBe(1);
    expect(root(fixture).querySelector('[data-resupply-unordered-editor]')).toBeNull();
  });

  it('la recherche filtre, sans accents ni casse', async () => {
    const { fixture, table } = await mount();

    table['query'].set('CHOCOLAT');
    await settle(fixture);
    expect(order(fixture)).toEqual(['PAC']);
  });

  it('les puces de famille : « Tout » puis une par famille présente, un clic filtre, combiné à la recherche', async () => {
    const { fixture, table } = await mount({
      stock: [{ sku: 'OLD', label: 'Ancien', receivedQuantity: 3, estimatedStock: 3 }],
    });

    expect(root(fixture).querySelector('[data-resupply-categories]')).not.toBeNull();
    expect(table['categoryOptions']().map((option) => option.label)).toEqual([
      'Tout',
      'Pains',
      'Viennoiseries',
    ]);

    table['category'].set('fam_morning');
    await settle(fixture);
    expect(order(fixture)).toEqual(['CRO', 'PAC']);

    table['query'].set('chocolat');
    await settle(fixture);
    expect(order(fixture)).toEqual(['PAC']);

    table['query'].set('');
    table['category'].set('');
    await settle(fixture);
    expect(order(fixture)).toEqual(['BAG', 'CRO', 'PAC', 'OLD']);
  });

  it('en lecture seule : ni sélecteur d’état, ni case, ni envoi', async () => {
    const { fixture } = await mount({ canWrite: false });

    expect(root(fixture).querySelector('[data-resupply-state]')).toBeNull();
    expect(root(fixture).querySelector('fold-number-input')).toBeNull();
    expect(root(fixture).querySelector('[data-resupply-send-asap]')).toBeNull();
  });
});
