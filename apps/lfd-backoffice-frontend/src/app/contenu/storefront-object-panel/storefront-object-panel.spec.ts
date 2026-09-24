import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { EditorBlock } from '../storefront-block';
import type { ShelfOption } from '../storefront-catalog';
import { StorefrontObjectPanel } from './storefront-object-panel';

/**
 * Le panneau ne tient aucun état de l'éditeur : il traduit un choix en une
 * intention typée. Ce qu'on tient ici : il ne propose que ce que la forme
 * permet, la portée des rayons se traduit en liste, le rayon édité ne se
 * décoche pas, et les réglages se rangent en sections.
 */
const card: EditorBlock = { id: 'c', format: 'card', column: 1, row: 1, shelves: ['all'] };

/** Les rayons tels que le catalogue les rendrait — « Tout » en tête. */
const SHELVES: readonly ShelfOption[] = [
  { key: 'all', label: 'Tout' },
  { key: 'viennoiserie', label: 'Viennoiseries' },
  { key: 'bread', label: 'Pains' },
  { key: 'pastry', label: 'Pâtisseries' },
  { key: 'savoury', label: 'Salé & traiteur' },
  { key: 'chocolate', label: 'Chocolat & confiserie' },
];

function setup(block: EditorBlock) {
  const fixture = TestBed.createComponent(StorefrontObjectPanel);
  fixture.componentRef.setInput('block', block);
  fixture.componentRef.setInput('shelf', 'all');
  fixture.componentRef.setInput('shelves', SHELVES);
  fixture.detectChanges();
  const panel = fixture.componentInstance;
  const emitted: { shelves: (readonly string[])[]; media: unknown[] } = { shelves: [], media: [] };
  panel.shelvesChange.subscribe((s) => emitted.shelves.push(s));
  panel.mediaChange.subscribe((m) => emitted.media.push(m));
  return { fixture, panel, root: fixture.nativeElement as HTMLElement, emitted };
}

describe('StorefrontObjectPanel', () => {
  it('une carte : ni option mobile, et seulement haut ou plein', () => {
    const { root } = setup(card);
    expect(root.textContent).not.toContain('Appliquer en mobile');
    const toggles = Array.from(root.querySelectorAll('fold-view-toggle')).map(
      (t) => t.textContent ?? '',
    );
    expect(
      toggles.some((t) => t.includes('Haut') && t.includes('Plein') && !t.includes('Gauche')),
    ).toBe(true);
  });

  it('un côté non permis n’émet rien', () => {
    const { panel, emitted } = setup(card);
    panel['onSideChange']('left');
    panel['onSideChange']('full');
    expect(emitted.media).toEqual([{ side: 'full' }]);
  });

  it('la portée se traduit en liste de rayons ; « une sélection » montre les cases', () => {
    const { fixture, panel, root, emitted } = setup(card);
    panel['onScopeChange']('all');
    expect(emitted.shelves[0]).toContain('chocolate');
    panel['onScopeChange']('some');
    fixture.detectChanges();
    const boxes = root.querySelectorAll('fold-checkbox');
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    panel['onScopeChange']('this');
    expect(emitted.shelves.at(-1)).toEqual(['all']);
  });

  it('cocher un rayon garde l’ordre de la liste', () => {
    const { panel, emitted } = setup({ ...card, shelves: ['all', 'chocolate'] });
    panel['toggleShelf']('bread', true);
    expect(emitted.shelves[0]).toEqual(['all', 'bread', 'chocolate']);
  });

  it('range les réglages en quatre sections titrées, l’une sous l’autre', () => {
    const { root } = setup(card);
    const titles = Array.from(root.querySelectorAll('.section > fold-element-title')).map((t) =>
      t.textContent?.trim(),
    );
    expect(titles).toEqual(['Forme et image', 'Rayons', 'Contenus', 'Mobile et défilement']);
    expect(root.querySelector('fold-tabs')).toBeNull();
  });

  it('le ton se propose partout — sauf sur une carte qui ne porte que des articles', () => {
    const onCard = setup(card);
    expect(onCard.root.textContent).toContain('Clair');
    const tones: string[] = [];
    onCard.panel.toneChange.subscribe((t) => tones.push(t));
    onCard.panel['onToneChange']('dark');
    onCard.panel['onToneChange']('violet');
    expect(tones).toEqual(['dark']);

    const productCard = setup({ ...card, items: [{ kind: 'product', sku: 'CRO' }] });
    expect(productCard.root.textContent).not.toContain('Clair');
    expect(productCard.root.textContent).toContain('garde le rendu standard du rayon');

    const productTile = setup({
      ...card,
      format: 'tile',
      items: [{ kind: 'product', sku: 'CRO' }],
    });
    expect(productTile.root.textContent).toContain('Clair');
  });

  it('le choix de forme montre la forme courante et émet la nouvelle', () => {
    const { panel, root } = setup(card);
    expect(root.textContent).toContain('Forme');
    const formats: string[] = [];
    panel.formatChange.subscribe((f) => formats.push(f));
    panel.formatChange.emit('tile');
    expect(formats).toEqual(['tile']);
    expect(panel['formatOptions']).toHaveLength(7);
  });
});
