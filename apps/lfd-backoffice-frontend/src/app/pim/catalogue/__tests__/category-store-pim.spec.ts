import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { type VersionWatch, VersionWatcher } from '../../../shared/version/version-watcher';
import type { Category } from '../../data/models';
import { CategoryHttpApi } from '../category-http-api';
import { CategoryStore } from '../category-store';

/**
 * Un store de référentiel suit le numéro `pim` (`plan-lectures-du-pim.md`,
 * § 4.3) : quand le veilleur voit un numéro différent, il se relit en fond.
 */

function category(id: string): Category {
  return { id, name: { fr: id }, position: 0, isArchived: false } as Category;
}

function setUp(granted: readonly string[]) {
  const watches: VersionWatch[] = [];
  let answer: () => Promise<Category[]> = () => Promise.resolve([category('pain')]);
  let reads = 0;
  TestBed.configureTestingModule({
    providers: [
      { provide: VersionWatcher, useValue: { watch: (spec: VersionWatch) => watches.push(spec) } },
      { provide: PermissionsStore, useValue: { can: (p: string) => granted.includes(p) } },
      {
        provide: CategoryHttpApi,
        useValue: {
          list: () => {
            reads += 1;
            return answer();
          },
        },
      },
    ],
  });
  const store = TestBed.inject(CategoryStore);
  return {
    store,
    watches,
    reads: () => reads,
    answer: (next: () => Promise<Category[]>) => (answer = next),
  };
}

function subjectsOf(watch: VersionWatch | undefined): readonly string[] {
  if (watch === undefined) {
    return [];
  }
  return typeof watch.subjects === 'function' ? watch.subjects() : watch.subjects;
}

describe('CategoryStore — le numéro `pim`', () => {
  it('se relit en fond quand le veilleur voit le numéro changer', async () => {
    const ctx = setUp(['pim_catalog:read']);
    await ctx.store.ensure();
    expect(subjectsOf(ctx.watches[0])).toEqual(['pim']);

    ctx.answer(() => Promise.resolve([category('pain'), category('vien')]));
    await ctx.watches[0]?.reload();

    expect(ctx.store.items().map((c) => c.id)).toEqual(['pain', 'vien']);
  });

  it('garde sa liste et ne dit pas d’erreur quand la relecture en fond échoue', async () => {
    const ctx = setUp(['pim_catalog:read']);
    await ctx.store.ensure();
    ctx.answer(() => Promise.reject(new Error('panne')));
    await ctx.watches[0]?.reload();
    expect(ctx.store.items().map((c) => c.id)).toEqual(['pain']);
    expect(ctx.store.loadError()).toBeNull();
  });

  it('partage la première lecture : ensure ne relit pas', async () => {
    const ctx = setUp(['pim_catalog:read']);
    await ctx.store.ensure();
    await ctx.store.ensure();
    expect(ctx.reads()).toBe(1);
  });

  it('ne suit pas `pim` sans le droit de sa route', () => {
    const ctx = setUp(['pim_tax:read']);
    expect(subjectsOf(ctx.watches[0])).toEqual([]);
  });
});
