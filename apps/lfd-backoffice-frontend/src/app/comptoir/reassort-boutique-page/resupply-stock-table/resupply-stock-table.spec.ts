import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  UnorderedReceiptLineView,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom n'a pas `matchMedia` : la table le lit pour la saisie mobile (2026-10-28).
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

import { ResupplyQuantityCell } from '../resupply-quantity-cell/resupply-quantity-cell';
import { ResupplyReceiptsService } from '../resupply-receipts.service';
import {
  ARTICLES,
  FakeAlerts,
  FakeReceipts,
  FakeResupplies,
  TODAY,
} from '../resupply-stock.testing';
import { SiteResuppliesService } from '../site-resupplies.service';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { SiteStockAlertsService } from '../site-stock-alerts.service';
import { SiteStockAlertsStore } from '../site-stock-alerts.store';
import { UnorderedReceiptEditor } from '../unordered-receipt-editor/unordered-receipt-editor';
import { ResupplyStockTable } from './resupply-stock-table';

/**
 * La table du réassort (R1e, 2026-10-21) : tous les produits, l'état en un
 * clic, la demande en cours saisie dans la case, le tri « ce qui manque
 * d'abord », et le reçu sans commande dans le menu de la ligne.
 */
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
    readonly day?: string;
    readonly stock?: readonly ResupplyReceiptLineView[];
    readonly unordered?: readonly UnorderedReceiptLineView[];
    readonly alerts?: FakeAlerts;
    readonly tomorrowOrderUntil?: string;
    readonly now?: number;
    readonly articles?: readonly ResupplyArticleView[];
  } = {},
): Promise<Mounted> {
  const resupplies = new FakeResupplies();
  resupplies.tomorrowOrderUntil = options.tomorrowOrderUntil ?? null;
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
  fixture.componentRef.setInput('day', options.day ?? TODAY);
  fixture.componentRef.setInput('articles', options.articles ?? ARTICLES);
  fixture.componentRef.setInput('stock', options.stock ?? []);
  fixture.componentRef.setInput('unordered', options.unordered ?? []);
  fixture.componentRef.setInput('canWrite', options.canWrite ?? true);
  if (options.now !== undefined) {
    fixture.componentInstance['now'].set(options.now);
  }
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

/** La case de quantité d'une ligne, telle que la table l'a posée. */
function cellOf(fixture: ComponentFixture<ResupplyStockTable>, sku: string): ResupplyQuantityCell {
  const cell = fixture.debugElement
    .queryAll(By.directive(ResupplyQuantityCell))
    .map((debug) => debug.componentInstance as ResupplyQuantityCell)
    .find((instance) => instance.row().sku === sku);
  if (cell === undefined) {
    throw new Error(`case absente : ${sku}`);
  }
  return cell;
}

/** L'éditeur du reçu sans commande ouvert sous la table. */
function editorOf(fixture: ComponentFixture<ResupplyStockTable>): UnorderedReceiptEditor {
  const editor = fixture.debugElement.query(By.directive(UnorderedReceiptEditor));
  if (editor === null) {
    throw new Error('éditeur du reçu sans commande absent');
  }
  return editor.componentInstance as UnorderedReceiptEditor;
}

const store = (): SiteResuppliesStore => TestBed.inject(SiteResuppliesStore);

describe('ResupplyStockTable', () => {
  it('montre tous les produits, leur stock du jour (somme des reçus) et un article reçu hors catalogue', async () => {
    const { fixture } = await mount({
      stock: [
        {
          sku: 'CRO',
          label: 'Croissant',
          receivedQuantity: 14,
          estimatedStock: 14,
          saleUnit: 'piece' as const,
        },
        {
          sku: 'OLD',
          label: 'Ancien',
          receivedQuantity: 3,
          estimatedStock: 3,
          saleUnit: 'piece' as const,
        },
      ],
    });

    expect(order(fixture)).toEqual(['BAG', 'CRO', 'PAC', 'OLD']);
    const stockOf = (sku: string): string | undefined =>
      root(fixture).querySelector(`[data-resupply-stock="${sku}"]`)?.textContent?.trim();
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
    const { fixture } = await mount({ alerts });

    await store().addLine('tomorrow', 'CRO', 5);
    await settle(fixture);

    expect(order(fixture)).toEqual(['PAC', 'CRO', 'BAG']);
  });

  it('la case écrit la demande en cours : ajoute, corrige, retire ; les pas s’ajoutent', async () => {
    const { fixture, table, resupplies } = await mount();

    table['chooseTarget']('asap');
    await settle(fixture);
    cellOf(fixture, 'CRO').setQuantity(6);
    await cellOf(fixture, 'CRO').commit();
    await settle(fixture);
    await cellOf(fixture, 'CRO').step(10);
    await settle(fixture);
    expect(rowOf(table, 'CRO').asap).toBe(16);

    cellOf(fixture, 'CRO').setQuantity(4);
    await cellOf(fixture, 'CRO').commit();
    await settle(fixture);
    cellOf(fixture, 'CRO').setQuantity(null);
    await cellOf(fixture, 'CRO').commit();
    await settle(fixture);

    expect(resupplies.calls).toEqual([
      'add asap CRO 6',
      'add asap CRO 10',
      'correct draft_asap CRO 4',
      'withdraw draft_asap CRO',
    ]);
  });

  /** Régression : la même requête d'ajout renvoyée doublait la quantité — chaque geste porte sa clé. */
  it('chaque ajout voulu porte sa propre clé d’intention', async () => {
    const { resupplies } = await mount();

    await store().addLine('asap', 'CRO', 1);
    await store().addLine('asap', 'CRO', 1);

    expect(resupplies.addKeys).toHaveLength(2);
    expect(resupplies.addKeys[0]).not.toBe(resupplies.addKeys[1]);
  });

  it('un seul « Envoyer », pour la visée affichée', async () => {
    const { fixture, table, resupplies } = await mount();

    table['chooseTarget']('asap');
    await store().addLine('asap', 'CRO', 1);
    await store().addLine('asap', 'PAC', 5);
    await settle(fixture);
    const buttons = root(fixture).querySelectorAll<HTMLButtonElement>('[data-resupply-send]');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toContain('Au plus tôt (2)');

    buttons[0]?.click();
    await settle(fixture);
    expect(resupplies.calls.at(-1)).toBe('send draft_asap');
  });

  /** R1f (2026-10-21) : une colonne, la visée choisie par l'heure limite puis d'un clic. */
  it('par défaut « Pour demain » avant l’heure limite, « Au plus tôt » après', async () => {
    const until = '2026-10-21T18:00:00.000Z';
    const before = await mount({ tomorrowOrderUntil: until, now: Date.parse(until) - 1 });
    expect(before.table['target']()).toBe('tomorrow');
    const after = await mount({ tomorrowOrderUntil: until, now: Date.parse(until) });
    expect(after.table['target']()).toBe('asap');
    const unlimited = await mount();
    expect(unlimited.table['target']()).toBe('tomorrow');
  });

  describe('l’heure limite franchie sur une table restée ouverte', () => {
    afterEach(() => vi.useRealTimers());

    /**
     * Régression (audit du 2026-11-03) : l'instant était lu une fois au
     * montage ; une table ouverte avant l'heure limite restait sur « Pour
     * demain » des heures après.
     */
    it('passe d’elle-même à « Au plus tôt », et arrête sa minuterie', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      const until = '2026-10-21T18:00:00.000Z';
      vi.setSystemTime(Date.parse(until) - 30_000);
      const { fixture, table } = await mount({ tomorrowOrderUntil: until });
      expect(table['target']()).toBe('tomorrow');

      vi.advanceTimersByTime(60_000);
      expect(table['target']()).toBe('asap');

      const running = vi.getTimerCount();
      fixture.destroy();
      expect(vi.getTimerCount()).toBe(running - 1);
    });
  });

  it('une seule colonne de quantité ; l’autre visée se signale par son compte', async () => {
    const { fixture, table } = await mount();
    expect(
      root(fixture).querySelectorAll('[data-resupply-quantity="CRO"] fold-number-input').length,
    ).toBe(1);

    await store().addLine('tomorrow', 'CRO', 3);
    await store().addLine('tomorrow', 'PAC', 3);
    await settle(fixture);
    expect(table['targetOptions']().map((option) => option.label)).toEqual([
      'Au plus tôt',
      'Pour demain',
    ]);

    table['chooseTarget']('asap');
    await settle(fixture);
    expect(table['targetOptions']().map((option) => option.label)).toEqual([
      'Au plus tôt',
      'Pour demain (2)',
    ]);
  });

  it('une rupture passe la visée en « Au plus tôt »', async () => {
    const { table } = await mount();
    await table['setState'](rowOf(table, 'PAC'), 'out_of_stock');
    expect(table['target']()).toBe('asap');
  });

  it('le reçu sans commande se saisit depuis la ligne, et la page relit', async () => {
    const { fixture, table, receipts } = await mount();
    let changed = 0;
    table.changed.subscribe(() => (changed += 1));

    table['openUnordered'](rowOf(table, 'BAG'));
    await settle(fixture);
    editorOf(fixture).quantity.set(8);
    await editorOf(fixture).save();
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
      stock: [
        {
          sku: 'OLD',
          label: 'Ancien',
          receivedQuantity: 3,
          estimatedStock: 3,
          saleUnit: 'piece' as const,
        },
      ],
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
    expect(root(fixture).querySelector('[data-resupply-send]')).toBeNull();
  });

  it('nomme la demande de la visée affichée (R1g), propose les noms employés, et relit le nom', async () => {
    const { fixture, table, resupplies } = await mount();
    resupplies.usedNames = ['Vitrine du matin', 'Goûter'];
    await TestBed.inject(SiteResuppliesStore).load('site_v');
    await settle(fixture);

    expect(table['usedNames']()).toEqual(['Vitrine du matin', 'Goûter']);
    expect(root(fixture).querySelector('[data-resupply-name]')).not.toBeNull();

    await table['rename']('Vitrine du matin');
    await settle(fixture);

    expect(resupplies.calls).toEqual(['name tomorrow Vitrine du matin']);
    expect(table['draftName']()).toBe('Vitrine du matin');
    expect(table['nameText']()).toBe('Vitrine du matin');
  });

  /** Lot L2b-4 : un article au poids compte des grammes, dits en kilos. */
  describe('au poids', () => {
    const GRAVLAX: ResupplyArticleView = {
      sku: 'GRA',
      name: 'Saumon gravlax',
      categoryId: 'fam_deli',
      categoryName: 'Traiteur',
      saleUnit: 'weight',
    };

    it('dit le stock « 3,75 kg », saisit en grammes avec des pas en grammes, et envoie des grammes', async () => {
      const { fixture, resupplies } = await mount({
        articles: [...ARTICLES, GRAVLAX],
        stock: [
          {
            sku: 'GRA',
            label: 'Saumon gravlax',
            receivedQuantity: 5000,
            estimatedStock: 3750,
            saleUnit: 'weight',
          },
          {
            sku: 'CRO',
            label: 'Croissant',
            receivedQuantity: 14,
            estimatedStock: 14,
            saleUnit: 'piece',
          },
        ],
      });
      const el = root(fixture);
      const stockOf = (sku: string): string | undefined =>
        el.querySelector(`[data-resupply-stock="${sku}"]`)?.textContent?.trim();
      expect(stockOf('GRA')).toBe('3,75 kg');
      expect(stockOf('CRO')).toBe('14');
      const shortcuts = (sku: string): number =>
        el.querySelectorAll(`[data-resupply-quantity="${sku}"] .shortcut`).length;
      const labels = (sku: string): string[] =>
        [...el.querySelectorAll(`[data-resupply-quantity="${sku}"] .shortcut`)].map(
          (button) => button.textContent?.trim() ?? '',
        );
      expect(labels('GRA')).toEqual(['−1 kg', '−500 g', '−100 g', '+100 g', '+500 g', '+1 kg']);
      expect(shortcuts('CRO')).toBe(8);

      // La visée affichée par défaut : « Pour demain », sans heure limite.
      cellOf(fixture, 'GRA').setQuantity(1250);
      await settle(fixture);
      expect(el.querySelector('[data-resupply-weight="GRA"]')?.textContent).toContain('1,25 kg');
      await cellOf(fixture, 'GRA').commit();
      await settle(fixture);

      expect(resupplies.calls).toEqual(['add tomorrow GRA 1250']);
    });

    it('le reçu sans commande d’un article au poids se dit en kilos et part en grammes', async () => {
      const { fixture, table, receipts } = await mount({
        articles: [GRAVLAX],
        unordered: [
          { sku: 'GRA', label: 'Saumon gravlax', receivedQuantity: 2000, saleUnit: 'weight' },
        ],
      });

      expect(root(fixture).textContent).toContain('Reçu sans commande (2 kg)');
      table['openUnordered'](rowOf(table, 'GRA'));
      await settle(fixture);
      editorOf(fixture).quantity.set(2500);
      await settle(fixture);
      expect(
        root(fixture).querySelector('[data-resupply-unordered-editor]')?.textContent,
      ).toContain('2,5 kg');
      await editorOf(fixture).save();

      expect(receipts.calls).toEqual(['correct GRA 2500']);
    });
  });

  /**
   * Régression (audit final du 2026-11-03, E1) : « + reçu sans commande »
   * était offert sur toute journée de la bande, et le serveur refuse désormais
   * hors d'aujourd'hui (409 `resupply.receipt.unordered_not_today`).
   */
  it('n’offre pas le reçu sans commande sur une autre journée qu’aujourd’hui', async () => {
    const { fixture, table } = await mount({ day: '2000-01-01' });
    expect(table['unorderedOpen']()).toBe(false);
    expect(table['columns']().map((column) => column.key)).not.toContain('actions');
    expect(root(fixture).textContent).not.toContain('reçu sans commande');
  });

  it('offre le reçu sans commande aujourd’hui, jour du serveur', async () => {
    const { table } = await mount();
    expect(table['unorderedOpen']()).toBe(true);
    expect(table['columns']().map((column) => column.key)).toContain('actions');
  });

  /**
   * E4 (audit final du 2026-11-03) : la liste porte aussi les déclinaisons
   * d'une fiche en vignette — chacune sa ligne, sous son propre nom, dans la
   * famille de sa fiche.
   */
  it('range les déclinaisons en vignette chacune sur sa ligne, dans leur famille', async () => {
    const variants: readonly ResupplyArticleView[] = [
      ...ARTICLES,
      {
        sku: 'TAR-6',
        name: 'Tarte citron 6 parts',
        categoryId: 'fam_tart',
        categoryName: 'Tartes',
        saleUnit: 'piece',
      },
      {
        sku: 'TAR-1',
        name: 'Tarte citron part',
        categoryId: 'fam_tart',
        categoryName: 'Tartes',
        saleUnit: 'piece',
      },
    ];
    const { fixture, table } = await mount({ articles: variants });
    expect(rowOf(table, 'TAR-6').name).toBe('Tarte citron 6 parts');
    expect(rowOf(table, 'TAR-1').name).toBe('Tarte citron part');
    expect(table['categoryOptions']().filter((option) => option.label === 'Tartes')).toHaveLength(
      1,
    );
    table['category'].set('fam_tart');
    await settle(fixture);
    expect(order(fixture)).toEqual(['TAR-6', 'TAR-1']);
  });
});
