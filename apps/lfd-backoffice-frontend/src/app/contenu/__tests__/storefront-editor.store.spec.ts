import { describe, expect, it } from 'vitest';

import { StorefrontEditorStore } from '../storefront-editor.store';
import { EMPTY_STATE, LOCAL_ID_PREFIX } from '../storefront-payload';

/**
 * Les intentions de la composition, sans page ni DOM : ce que le store garantit
 * seul. Le parcours à l'écran reste éprouvé par `storefront-page.spec.ts`.
 */
describe('StorefrontEditorStore', () => {
  it('poser une forme la place à la première case libre, la sélectionne, et rend la vitrine modifiée', () => {
    const store = new StorefrontEditorStore();
    store.apply(EMPTY_STATE);
    store.addFormat('tile');
    const [placed] = store.blocks();
    expect(placed).toMatchObject({ format: 'tile', column: 1, row: 1, shelves: ['all'] });
    expect(placed?.id.startsWith(LOCAL_ID_PREFIX)).toBe(true);
    expect(store.selectedId()).toBe(placed?.id);
    expect(store.dirty()).toBe(true);
  });

  it('apply remet la vitrine au propre et oublie une sélection qui n’existe plus', () => {
    const store = new StorefrontEditorStore();
    store.addFormat('tile');
    store.notice.set('un refus');
    store.apply(EMPTY_STATE);
    expect(store.dirty()).toBe(false);
    expect(store.selectedId()).toBeNull();
    expect(store.notice()).toBeNull();
  });

  it('retirer l’objet sélectionné vide la sélection', () => {
    const store = new StorefrontEditorStore();
    store.addFormat('tile');
    const id = store.selectedId();
    if (id === null) throw new Error('rien de posé');
    store.remove(id);
    expect(store.blocks()).toEqual([]);
    expect(store.selectedId()).toBeNull();
  });

  it('réduire les rangées sous un objet est refusé, en le disant', () => {
    const store = new StorefrontEditorStore();
    store.addFormat('tile');
    store.moveSelected(0, 2);
    expect(store.setRows(2)).toBe(false);
    expect(store.notice()).toContain('dépasserait');
    expect(store.setRows(3)).toBe(true);
    expect(store.rows()).toBe(3);
  });

  it('sans catalogue, aucun rayon n’est déclaré disparu', () => {
    const store = new StorefrontEditorStore();
    store.apply({ ...EMPTY_STATE, rows: { gone: 4 } });
    expect(store.vanished()).toEqual([]);
    expect(store.shelves().map((shelf) => shelf.key)).toEqual(['all', 'gone']);
  });
});
