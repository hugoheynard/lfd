import { TestBed } from '@angular/core/testing';
import type { StorefrontContent } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { EditorBlock } from '../storefront-block';
import type { StorefrontCatalog } from '../storefront-catalog';
import { StorefrontContentsEditor } from './storefront-contents-editor';

/**
 * La liste des contenus : un seul ou plusieurs, l'ordre du défilement, le nom
 * d'un article et sa marque quand il n'est plus en vente.
 */
const CATALOG: StorefrontCatalog = {
  shelves: [{ key: 'all', label: 'Tout' }],
  products: [
    { sku: 'CRO', name: 'Croissant', shelf: 'vien' },
    { sku: 'BAG', name: 'Baguette', shelf: 'bread' },
  ],
};

function block(items: readonly StorefrontContent[], multiple = true): EditorBlock {
  return {
    id: 'b',
    format: 'tile',
    column: 1,
    row: 1,
    shelves: ['all'],
    contents: multiple ? 'multiple' : 'single',
    items,
  };
}

function setup(target: EditorBlock, catalog: StorefrontCatalog | null = CATALOG) {
  const fixture = TestBed.createComponent(StorefrontContentsEditor);
  fixture.componentRef.setInput('block', target);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('shelves', CATALOG.shelves);
  fixture.detectChanges();
  const editor = fixture.componentInstance;
  const emitted: (readonly StorefrontContent[])[] = [];
  editor.itemsChange.subscribe((items) => emitted.push(items));
  return { fixture, editor, emitted, root: fixture.nativeElement as HTMLElement };
}

const croissant: StorefrontContent = { kind: 'product', sku: 'CRO' };
const gone: StorefrontContent = { kind: 'product', sku: 'OLD' };

describe('StorefrontContentsEditor', () => {
  it('montre le nom de l’article, et marque celui qui n’est plus en vente', () => {
    const { root } = setup(block([croissant, gone]));
    expect(root.textContent).toContain('Croissant');
    expect(root.textContent).toContain('OLD');
    expect(root.querySelectorAll('fold-badge')).toHaveLength(1);
  });

  it('sans catalogue : aucune marque affirmée, et l’ajout d’un article fermé', () => {
    const { root } = setup(block([gone]), null);
    expect(root.querySelectorAll('fold-badge')).toHaveLength(0);
    const add = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ajouter un article'),
    );
    expect(add?.disabled).toBe(true);
  });

  it('ajoute un article par son seul SKU, et une info qui s’ouvre aussitôt', () => {
    const { editor, emitted } = setup(block([croissant]));
    editor['addProduct']('BAG');
    expect(emitted.at(-1)).toEqual([croissant, { kind: 'product', sku: 'BAG' }]);
    editor['addInfo']();
    expect(emitted.at(-1)?.at(-1)).toMatchObject({ kind: 'info', title: { fr: '' } });
    expect(editor['isOpen'](1)).toBe(true);
  });

  it('réordonne et retire', () => {
    const { editor, emitted } = setup(block([croissant, gone]));
    editor['move'](0, 1);
    expect(emitted.at(-1)).toEqual([gone, croissant]);
    editor['remove'](0);
    expect(emitted.at(-1)).toEqual([gone]);
  });

  it('« un seul » contenu déjà posé : on n’en ajoute pas d’autre', () => {
    const { root } = setup(block([croissant], false));
    expect(root.textContent).toContain('passez à « Plusieurs »');
    expect(root.textContent).not.toContain('Ajouter une info');
  });

  it('une info sans titre le dit sous la ligne', () => {
    const { root } = setup(
      block([
        {
          kind: 'info',
          badge: null,
          title: { fr: '' },
          lede: null,
          image: null,
          linkShelfKey: null,
        },
      ]),
    );
    expect(root.textContent).toContain('Le titre en français est obligatoire.');
  });
});
