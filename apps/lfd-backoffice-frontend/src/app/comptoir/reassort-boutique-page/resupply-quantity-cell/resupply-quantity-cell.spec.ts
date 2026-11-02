import { TestBed } from '@angular/core/testing';
import type { ResupplyTarget } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { buildStockRows } from '../resupply-stock-rows';
import { ARTICLES, FakeResupplies } from '../resupply-stock.testing';
import { SiteResuppliesService } from '../site-resupplies.service';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { ResupplyQuantityCell } from './resupply-quantity-cell';

/**
 * La case de quantité d'une ligne du réassort : la saisie en cours, son
 * écriture à la sortie de la case, et les pas rapides.
 */
async function mount(target: ResupplyTarget = 'asap') {
  const resupplies = new FakeResupplies();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyQuantityCell],
    providers: [SiteResuppliesStore, { provide: SiteResuppliesService, useValue: resupplies }],
  });
  const store = TestBed.inject(SiteResuppliesStore);
  await store.load('site_v');
  const fixture = TestBed.createComponent(ResupplyQuantityCell);
  /** Rebranche la ligne et la demande sur ce que le magasin vient de relire. */
  const sync = (): void => {
    const draft = store.drafts().find((d) => d.target === target) ?? null;
    const rows = buildStockRows({
      articles: ARTICLES,
      stock: [],
      unordered: [],
      alertLevels: new Map(),
      asapDraft: target === 'asap' ? draft : null,
      tomorrowDraft: target === 'tomorrow' ? draft : null,
    });
    fixture.componentRef.setInput(
      'row',
      rows.find((row) => row.sku === 'CRO'),
    );
    fixture.componentRef.setInput('draft', draft);
    fixture.detectChanges();
  };
  fixture.componentRef.setInput('target', target);
  sync();
  return { cell: fixture.componentInstance, resupplies, sync };
}

describe('ResupplyQuantityCell', () => {
  it('écrit la saisie à la sortie de la case, et rien si elle n’a pas changé', async () => {
    const { cell, resupplies, sync } = await mount();
    cell.setQuantity(6);
    expect(cell.quantity()).toBe(6);
    await cell.commit();
    sync();
    expect(cell.quantity()).toBe(6);

    cell.setQuantity(6);
    await cell.commit();
    expect(resupplies.calls).toEqual(['add asap CRO 6']);
  });

  it('un pas retiré corrige sans descendre sous zéro, et retire la ligne à zéro', async () => {
    const { cell, resupplies, sync } = await mount();
    await cell.step(10);
    sync();
    await cell.stepDown(4);
    sync();
    await cell.stepDown(50);
    sync();
    await cell.stepDown(1);

    expect(resupplies.calls).toEqual([
      'add asap CRO 10',
      'correct draft_asap CRO 6',
      'withdraw draft_asap CRO',
    ]);
    expect(cell.quantity()).toBeNull();
  });

  /** Une saisie faite sur une demande qu'un autre poste a changée tombe d'elle-même. */
  it('oublie la saisie quand la version de la demande change', async () => {
    const { cell, resupplies, sync } = await mount();
    await cell.step(2);
    sync();
    cell.setQuantity(9);
    await TestBed.inject(SiteResuppliesStore).addLine('asap', 'PAC', 1);
    sync();

    expect(cell.quantity()).toBe(2);
    await cell.commit();
    expect(resupplies.calls).toEqual(['add asap CRO 2', 'add asap PAC 1']);
  });

  /**
   * Régression (audit du 2026-11-03) : la case quittée écrivait, et le « −1 »
   * cliqué dans la foulée était jeté en silence parce qu'un geste était en
   * cours. Il est désormais mis en file, et part de la saisie écrite.
   */
  it('ne perd pas le « −1 » cliqué pendant que la saisie s’écrit', async () => {
    const { cell, resupplies, sync } = await mount();
    cell.setQuantity(5);
    const first = cell.commit();
    const second = cell.stepDown(1);
    await Promise.all([first, second]);
    sync();

    expect(resupplies.calls).toEqual(['add asap CRO 5', 'correct draft_asap CRO 4']);
    expect(cell.quantity()).toBe(4);
  });
});
