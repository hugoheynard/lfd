import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { MediaTagView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { MediaLibraryHttpApi } from '../media-library-http-api';
import type { ChipBox, FoldLayout } from '../tag-fold';
import { TagPaletteStore } from '../tag-palette';

import { TagBand } from './tag-band';

/**
 * Ce que ces cas tiennent : **un seul champ cherche ou crée**, et la bande
 * repliée tient en deux rangées sans jamais cacher le mot qu'on utilise.
 *
 * Retour Hugo (2026-10-10) : chaque mot ajouté rallongeait la bande d'autant,
 * et « Nouveau mot-clé » créait sans montrer ce qui existait déjà.
 */

class FakeTags {
  vocabulary: MediaTagView[] = [];
  tags(): Promise<readonly MediaTagView[]> {
    return Promise.resolve(this.vocabulary);
  }
}

/** Quatre pastilles par rangée : le jsdom ne mesure rien, on lui dicte. */
function layoutOf(count: number): FoldLayout {
  const boxes: ChipBox[] = Array.from({ length: count }, (_, index) => ({
    top: Math.floor(index / 4) * 30,
    left: (index % 4) * 70,
    width: 60,
  }));
  return { boxes, width: 400, reserve: 50, gap: 10 };
}

interface Mounted {
  readonly fixture: ComponentFixture<TagBand>;
  readonly band: TagBand;
  readonly palette: TagPaletteStore;
}

async function mount(
  words: readonly string[],
  filterTags: readonly string[] = [],
): Promise<Mounted> {
  const api = new FakeTags();
  // Comptes décroissants : l'ordre de la bande est celui de la liste.
  api.vocabulary = words.map((tag, index) => ({ tag, count: words.length - index }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TagBand],
    providers: [
      provideZonelessChangeDetection(),
      TagPaletteStore,
      { provide: MediaLibraryHttpApi, useValue: api },
    ],
  });
  const palette = TestBed.inject(TagPaletteStore);
  await palette.refresh();
  const fixture = TestBed.createComponent(TagBand);
  const band = fixture.componentInstance;
  // La géométrie se dicte : la mesure lit autant de boîtes que de mots rendus.
  band['readLayout'] = () => layoutOf(band['ordered']().length);
  fixture.componentRef.setInput('filterTags', filterTags);
  await settle(fixture);
  return { fixture, band, palette };
}

async function settle(fixture: ComponentFixture<TagBand>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function chips(fixture: ComponentFixture<TagBand>): string[] {
  const host: HTMLElement = fixture.nativeElement;
  return [...host.querySelectorAll('app-tag-chip .word > span:first-child')].map(
    (node) => node.textContent?.trim() ?? '',
  );
}

function buttons(fixture: ComponentFixture<TagBand>): string[] {
  const host: HTMLElement = fixture.nativeElement;
  return [...host.querySelectorAll('ul > li:not(.word-item) button')].map(
    (node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );
}

function press(fixture: ComponentFixture<TagBand>, key: string): void {
  const search: HTMLElement = fixture.nativeElement.querySelector('fold-search');
  search.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

const TWELVE = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'b1', 'b2', 'b3'];

describe('la bande de mots-clés', () => {
  it('filtre en direct, et propose « Créer » seulement sans correspondance exacte', async () => {
    const { fixture, palette } = await mount(['croissant', 'pain', 'chausson']);

    palette.search.set('ss');
    await settle(fixture);
    expect(chips(fixture)).toEqual(['croissant', 'chausson']);
    expect(buttons(fixture)).toEqual(['Créer « ss »']);

    palette.search.set('Pain');
    await settle(fixture);
    expect(chips(fixture)).toEqual(['pain']);
    expect(buttons(fixture)).toEqual([]);
  });

  it('Entrée crée le mot absent, l’arme et vide le champ', async () => {
    const { fixture, palette } = await mount(['croissant']);

    palette.search.set('Brioche');
    await settle(fixture);
    press(fixture, 'Enter');
    await settle(fixture);

    expect(palette.armed()).toBe('brioche');
    expect(palette.search()).toBe('');
    expect(palette.words()).toContain('brioche');
  });

  it('Entrée arme le mot exact au lieu d’en créer un', async () => {
    const { fixture, palette } = await mount(['croissant', 'pain']);

    palette.search.set('PAIN ');
    await settle(fixture);
    press(fixture, 'Enter');
    await settle(fixture);

    expect(palette.armed()).toBe('pain');
    expect(palette.words()).toEqual(['croissant', 'pain']);
  });

  it('Échap vide le champ', async () => {
    const { fixture, palette } = await mount(['croissant']);

    palette.search.set('cro');
    await settle(fixture);
    press(fixture, 'Escape');

    expect(palette.search()).toBe('');
  });

  it('replie à deux rangées et dit combien restent, puis déplie et réduit', async () => {
    const { fixture, band } = await mount(TWELVE);

    expect(chips(fixture)).toEqual(TWELVE.slice(0, 8));
    expect(buttons(fixture)).toEqual(['+ 4 autres']);

    band['toggleExpanded']();
    await settle(fixture);
    expect(chips(fixture)).toEqual(TWELVE);
    expect(buttons(fixture)).toEqual(['Réduire']);

    band['toggleExpanded']();
    await settle(fixture);
    expect(chips(fixture)).toEqual(TWELVE.slice(0, 8));
  });

  it('ne replie rien quand tout tient', async () => {
    const { fixture } = await mount(TWELVE.slice(0, 8));

    expect(chips(fixture)).toEqual(TWELVE.slice(0, 8));
    expect(buttons(fixture)).toEqual([]);
  });

  it('montre tous les résultats, sans borne, pendant une saisie', async () => {
    const { fixture, palette } = await mount(TWELVE);

    palette.search.set('a');
    await settle(fixture);

    expect(chips(fixture)).toEqual(TWELVE.slice(0, 9));
    expect(buttons(fixture)).toEqual(['Créer « a »']);
  });

  it('épingle en tête le mot armé et ceux du filtre, même s’ils seraient repliés', async () => {
    const { fixture, palette } = await mount(TWELVE, ['b2']);

    palette.armed.set('b3');
    await settle(fixture);

    expect(chips(fixture).slice(0, 2)).toEqual(['b3', 'b2']);
    expect(chips(fixture)).toHaveLength(8);
  });
});
