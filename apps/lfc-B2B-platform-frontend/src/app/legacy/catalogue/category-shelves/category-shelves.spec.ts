import { TestBed } from '@angular/core/testing';

import type { FoldProduct } from '../../../../shared';
import type { CatalogueCategory } from '../../data/catalogue-seed';
import { CategoryShelves } from './category-shelves';

const CATEGORIES: readonly CatalogueCategory[] = [
  { id: 'vie', label: 'Viennoiseries' },
  { id: 'pai', label: 'Pains' },
];

function product(id: string, category?: string): FoldProduct {
  return { id, name: id, ...(category === undefined ? {} : { category }) };
}

/** Instancie le composant avec ses inputs et rend le premier cycle. */
function make(products: readonly FoldProduct[]): CategoryShelves {
  const fixture = TestBed.createComponent(CategoryShelves);
  fixture.componentRef.setInput('products', products);
  fixture.componentRef.setInput('categories', CATEGORIES);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('CategoryShelves', () => {
  it('groupe par catégorie dans l’ordre des catégories, avec le compte', () => {
    const shelves = make([product('c1', 'vie'), product('p1', 'pai'), product('c2', 'vie')])[
      'shelves'
    ]();

    expect(shelves.map((s) => [s.id, s.count])).toEqual([
      ['vie', 2],
      ['pai', 1],
    ]);
  });

  it('omet les catégories vides', () => {
    const shelves = make([product('c1', 'vie')])['shelves']();
    expect(shelves.map((s) => s.id)).toEqual(['vie']);
  });

  it('rassemble les produits sans catégorie (ou inconnue) dans « Autres », en fin', () => {
    const shelves = make([product('c1', 'vie'), product('x1'), product('x2', 'fantome')])[
      'shelves'
    ]();

    expect(shelves.map((s) => s.id)).toEqual(['vie', '__other__']);
    const other = shelves.at(-1);
    expect(other?.label).toBe('Autres');
    expect(other?.count).toBe(2);
  });

  it('replie / déplie un rayon (déplié par défaut)', () => {
    const cmp = make([product('c1', 'vie')]);
    expect(cmp['isCollapsed']('vie')).toBe(false);
    cmp['toggle']('vie');
    expect(cmp['isCollapsed']('vie')).toBe(true);
    cmp['toggle']('vie');
    expect(cmp['isCollapsed']('vie')).toBe(false);
  });
});
