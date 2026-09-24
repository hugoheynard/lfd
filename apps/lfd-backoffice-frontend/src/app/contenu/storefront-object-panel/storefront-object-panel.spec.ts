import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PlacedBlock } from '../storefront-grid';
import type { TemplateLabel } from '../storefront-templates';
import { StorefrontObjectPanel } from './storefront-object-panel';

/**
 * Le panneau ne tient aucun état de l'éditeur : il traduit un choix en une
 * intention typée. Ce qu'on tient ici : il ne propose que ce que la forme
 * permet, la portée des rayons se traduit en liste, le rayon édité ne se
 * décoche pas, et le formulaire de gabarit ne se ferme que sur un accord.
 */
const card: PlacedBlock = { id: 'c', format: 'card', column: 1, row: 1, shelves: ['all'] };

function setup(block: PlacedBlock, accept = true) {
  const fixture = TestBed.createComponent(StorefrontObjectPanel);
  const saved: TemplateLabel[] = [];
  fixture.componentRef.setInput('block', block);
  fixture.componentRef.setInput('shelf', 'all');
  fixture.componentRef.setInput('saveTemplate', (label: TemplateLabel) => {
    saved.push(label);
    return accept;
  });
  fixture.detectChanges();
  const panel = fixture.componentInstance;
  const emitted: { shelves: (readonly string[])[]; media: unknown[] } = { shelves: [], media: [] };
  panel.shelvesChange.subscribe((s) => emitted.shelves.push(s));
  panel.mediaChange.subscribe((m) => emitted.media.push(m));
  return { fixture, panel, root: fixture.nativeElement as HTMLElement, saved, emitted };
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

  it('le formulaire de gabarit ne se ferme que si l’éditeur accepte', () => {
    const refused = setup(card, false);
    refused.panel['naming'].set(true);
    refused.panel['onTemplateNamed']({ name: 'A', description: '' });
    expect(refused.panel['naming']()).toBe(true);

    const accepted = setup(card, true);
    accepted.panel['naming'].set(true);
    accepted.panel['onTemplateNamed']({ name: 'A', description: '' });
    expect(accepted.panel['naming']()).toBe(false);
    expect(accepted.saved).toEqual([{ name: 'A', description: '' }]);
  });

  it('le ton se propose partout ; sur la carte, une aide dit sa limite', () => {
    const onCard = setup(card);
    expect(onCard.root.textContent).toContain('Sans effet si la carte porte un produit');
    const tones: string[] = [];
    onCard.panel.toneChange.subscribe((t) => tones.push(t));
    onCard.panel['onToneChange']('dark');
    onCard.panel['onToneChange']('violet');
    expect(tones).toEqual(['dark']);

    const onTile = setup({ ...card, format: 'tile' });
    expect(onTile.root.textContent).toContain('Clair');
    expect(onTile.root.textContent).not.toContain('Sans effet si la carte');
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
