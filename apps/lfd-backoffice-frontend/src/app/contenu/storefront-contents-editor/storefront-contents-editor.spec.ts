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
    const { root, fixture, editor } = setup(block([croissant, gone]));
    expect(root.textContent).toContain('Croissant');
    expect(root.textContent).toContain('OLD');
    // L'onglet le signale d'emblée ; le détail se lit sur le contenu ouvert.
    expect(root.querySelectorAll('.tab.flagged')).toHaveLength(1);
    expect(root.querySelectorAll('fold-badge')).toHaveLength(0);
    editor.selected.set(1);
    fixture.detectChanges();
    expect(root.querySelectorAll('fold-badge')).toHaveLength(1);
  });

  it('sans catalogue : aucune marque affirmée, et l’ajout d’un article fermé', () => {
    const { root } = setup(block([gone]), null);
    expect(root.querySelectorAll('fold-badge')).toHaveLength(0);
    const add = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Article'),
    );
    expect(add?.disabled).toBe(true);
  });

  it('ajoute un article par son seul SKU, et le contenu ajouté devient celui qu’on prépare', () => {
    const { editor, emitted } = setup(block([croissant]));
    editor['addProduct']('BAG');
    expect(emitted.at(-1)).toEqual([croissant, { kind: 'product', sku: 'BAG' }]);
    expect(editor.selected()).toBe(1);
    editor['addInfo']();
    expect(emitted.at(-1)?.at(-1)).toMatchObject({ kind: 'info', title: { fr: '' } });
    // L'index est pris AVANT l'émission (régression du 2026-09-24 : un cran trop loin).
    expect(editor.selected()).toBe(1);
  });

  it('réordonne et retire le contenu sélectionné, et la sélection le suit', () => {
    const { editor, emitted } = setup(block([croissant, gone]));
    editor['move'](1);
    expect(emitted.at(-1)).toEqual([gone, croissant]);
    expect(editor.selected()).toBe(1);
    editor.selected.set(0);
    // La liste d'entrée n'a pas bougé (le parent n'est pas là) : on retire le premier de [croissant, OLD].
    editor['remove']();
    expect(emitted.at(-1)).toEqual([gone]);
  });

  it('dit la durée à l’écran de chaque contenu en défilement automatique', () => {
    const { root } = setup({
      ...block([croissant, gone]),
      carousel: {
        nav: 'dots',
        autoplay: true,
        firstSeconds: 8,
        intervalSeconds: 4,
        sampleCount: 3,
      },
    });
    const tabs = Array.from(root.querySelectorAll('.tab:not(.add-tab)'), (t) => t.textContent);
    expect(tabs[0]).toContain('8 s');
    expect(tabs[1]).toContain('4 s');
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
