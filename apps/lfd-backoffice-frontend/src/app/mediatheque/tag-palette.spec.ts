import { TestBed } from '@angular/core/testing';
import type { MediaTagView, RenameMediaTagPayload } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { MediaLibraryHttpApi } from './media-library-http-api';
import { TagPaletteStore } from './tag-palette';

/**
 * Ce que ces cas tiennent : **la bande montre le vocabulaire du FONDS**, avec
 * son compte, et ce qui va être écrit.
 *
 * Régression (L1, 2026-10-10) : la bande dérivait son vocabulaire des images
 * CHARGÉES. Un mot porté seulement par une image hors de la page n'y figurait
 * pas, et rien ne le disait.
 */

class FakeTags {
  vocabulary: MediaTagView[] = [];
  fails = false;
  renamed: RenameMediaTagPayload[] = [];
  removed: string[] = [];

  tags(): Promise<readonly MediaTagView[]> {
    return this.fails ? Promise.reject(new Error('réseau')) : Promise.resolve(this.vocabulary);
  }

  renameTag(payload: RenameMediaTagPayload): Promise<void> {
    this.renamed.push(payload);
    return Promise.resolve();
  }

  removeTag(tag: string): Promise<void> {
    this.removed.push(tag);
    return Promise.resolve();
  }
}

function palette(vocabulary: MediaTagView[] = []): { band: TagPaletteStore; api: FakeTags } {
  const api = new FakeTags();
  api.vocabulary = vocabulary;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [TagPaletteStore, { provide: MediaLibraryHttpApi, useValue: api }],
  });
  return { band: TestBed.inject(TagPaletteStore), api };
}

describe('la bande de tags', () => {
  it('lit le vocabulaire du fonds, avec le compte de chaque mot', async () => {
    const { band } = palette([
      { tag: 'croissant', count: 12 },
      { tag: 'beurre', count: 3 },
    ]);

    await band.refresh();

    expect(band.all()).toEqual([
      { tag: 'beurre', count: 3, fresh: false },
      { tag: 'croissant', count: 12, fresh: false },
    ]);
  });

  it('normalise à la saisie, comme le fera le serveur', () => {
    const { band } = palette();

    expect(band.draft('  Croissant ')).toBe('croissant');
    expect(band.words()).toEqual(['croissant']);
  });

  it('refuse une saisie vide sans rien ajouter', () => {
    const { band } = palette();

    expect(band.draft('   ')).toBeNull();
    expect(band.all()).toEqual([]);
  });

  it('garde un mot inventé, à zéro et marqué « pas encore posé »', async () => {
    const { band } = palette([{ tag: 'croissant', count: 12 }]);
    band.draft('nouveau');

    // Une relecture du serveur ne doit pas l'emporter sous les doigts.
    await band.refresh();

    expect(band.all()).toContainEqual({ tag: 'nouveau', count: 0, fresh: true });
  });

  it('ne double pas un mot déjà au fonds', async () => {
    const { band } = palette([{ tag: 'croissant', count: 12 }]);
    await band.refresh();

    band.draft('Croissant');

    expect(band.all()).toEqual([{ tag: 'croissant', count: 12, fresh: false }]);
  });

  it('cesse de marquer « pas encore posé » un mot que le fonds porte désormais', async () => {
    const { band, api } = palette();
    band.draft('nouveau');

    api.vocabulary = [{ tag: 'nouveau', count: 1 }];
    await band.refresh();

    expect(band.all()).toEqual([{ tag: 'nouveau', count: 1, fresh: false }]);
  });

  it('trouve un mot par son milieu', async () => {
    const { band } = palette([
      { tag: 'croissant', count: 1 },
      { tag: 'beurre', count: 1 },
    ]);
    await band.refresh();

    band.search.set('SANT');

    expect(band.shown().map((entry) => entry.tag)).toEqual(['croissant']);
  });

  it('arme le mot qu’on vient d’écrire, et le désarme au second clic', () => {
    const { band } = palette();

    band.draft('croissant');
    expect(band.armed()).toBe('croissant');

    band.toggle('croissant');
    expect(band.armed()).toBeNull();
  });

  it('dit qu’il n’a pas pu relire, et garde ce qu’il avait', async () => {
    const { band, api } = palette([{ tag: 'croissant', count: 12 }]);
    await band.refresh();

    api.fails = true;
    await band.refresh();

    expect(band.failure()).not.toBeNull();
    expect(band.words()).toEqual(['croissant']);
  });

  it('suit le mot armé quand il est renommé', async () => {
    const { band, api } = palette([{ tag: 'croisant', count: 3 }]);
    await band.refresh();
    band.toggle('croisant');

    await band.rename('croisant', 'Croissant');

    expect(api.renamed).toEqual([{ from: 'croisant', to: 'Croissant' }]);
    expect(band.armed()).toBe('croissant');
  });

  it('désarme un mot retiré partout', async () => {
    const { band, api } = palette([{ tag: 'croisant', count: 3 }]);
    await band.refresh();
    band.toggle('croisant');

    await band.remove('croisant');

    expect(api.removed).toEqual(['croisant']);
    expect(band.armed()).toBeNull();
  });
});
