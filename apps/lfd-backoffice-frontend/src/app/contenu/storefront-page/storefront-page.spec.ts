import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { StorefrontPage } from './storefront-page';

/**
 * Ce que ces cas tiennent : la page commence sur l'exemple marqué comme tel,
 * la voie clavier pose / déplace / retire, et la réduction des rangées est
 * refusée en nommant l'objet qui gêne. La règle elle-même est éprouvée dans
 * `storefront-grid.spec.ts`.
 */
function setup() {
  const fixture = TestBed.createComponent(StorefrontPage);
  fixture.detectChanges();
  const page = fixture.componentInstance;
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, page, root };
}

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('StorefrontPage', () => {
  it("s'ouvre sur l'exemple, marqué comme tel, et dit que rien n'est enregistré", () => {
    const { page, root } = setup();
    expect(page.rows()).toBe(6);
    expect(page.blocks().map((b) => b.format)).toEqual(['tile', 'card', 'tile', 'doubleBand']);
    expect(root.textContent).toContain('Exemple');
    expect(root.textContent).toContain('rien n’est enregistré');
    expect(root.querySelectorAll('.block')).toHaveLength(4);
  });

  it('montre un repère « article du rayon » sur chaque case libre', () => {
    const { root } = setup();
    // 6 × 5 = 30 cases, moins 5 (rangée 1) et 10 (bande double) = 15.
    const free = root.querySelectorAll('.grid .free-cell');
    expect(free).toHaveLength(15);
    expect(free[0]?.textContent).toContain('article du rayon');
  });

  it('pose depuis la palette à la première place libre', () => {
    const { page, fixture, root } = setup();
    page.addFormat('card');
    fixture.detectChanges();
    const added = page.blocks().at(-1);
    expect(added).toMatchObject({ format: 'card', column: 1, row: 2 });
    expect(page.selectedId()).toBe(added?.id);
    expect(root.textContent).not.toContain('Exemple :');
  });

  it('déplace à la flèche et refuse le chevauchement en le disant', () => {
    const { fixture, page, root } = setup();
    const cardBlock = root.querySelectorAll('.block')[1];
    if (cardBlock === undefined) throw new Error('carte absente');
    key(cardBlock, 'ArrowDown');
    fixture.detectChanges();
    expect(page.blocks()[1]).toMatchObject({ column: 3, row: 2 });

    key(cardBlock, 'ArrowDown');
    fixture.detectChanges();
    expect(page.blocks()[1]).toMatchObject({ column: 3, row: 2 });
    expect(root.textContent).toContain('Sur le rayon « Tout », chevauche « Bande double 5×2 »');
  });

  it('retire à Suppr', () => {
    const { fixture, page, root } = setup();
    const tileBlock = root.querySelector('.block');
    if (tileBlock === null) throw new Error('tuile absente');
    key(tileBlock, 'Delete');
    fixture.detectChanges();
    expect(page.blocks().map((b) => b.format)).toEqual(['card', 'tile', 'doubleBand']);
  });

  it('refuse de réduire sous un objet posé, en le nommant', () => {
    const { fixture, page, root } = setup();
    expect(page.setRows(3)).toBe(false);
    fixture.detectChanges();
    expect(page.rows()).toBe(6);
    expect(root.textContent).toContain(
      '« Bande double 5×2 » (« Tout », « Chocolat & confiserie », colonne 1, rangée 3)',
    );

    expect(page.setRows(4)).toBe(true);
    expect(page.rows()).toBe(4);
  });

  it('chaque rayon a sa page ; un objet partagé paraît sur toutes les siennes, avec son repère', () => {
    const { fixture, page, root } = setup();
    expect(root.textContent).toContain('le reste du rayon s’écoule ici');
    page.pickShelf('chocolate');
    fixture.detectChanges();
    const blocks = root.querySelectorAll('.block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.textContent).toContain('partagé · 2 rayons');

    page.pickShelf('bread');
    fixture.detectChanges();
    expect(root.querySelectorAll('.block')).toHaveLength(0);
    expect(root.querySelectorAll('.grid .free-cell').length).toBeGreaterThanOrEqual(30);
  });

  it('pose un objet neuf sur le rayon édité seulement', () => {
    const { page } = setup();
    page.pickShelf('bread');
    page.addFormat('block');
    expect(page.blocks().at(-1)).toMatchObject({
      format: 'block',
      column: 1,
      row: 1,
      shelves: ['bread'],
    });
  });

  it('refuse d’étendre un objet à un rayon où la place est prise, en nommant le rayon', () => {
    const { fixture, page, root } = setup();
    page.pickShelf('chocolate');
    page.addFormat('card'); // (1,1) sur « Chocolat & confiserie », libre là-bas
    page.pickShelf('all');
    page.select('example-1');
    page.setSelectedShelves(['all', 'chocolate']);
    fixture.detectChanges();
    expect(page.blocks().find((b) => b.id === 'example-1')?.shelves).toEqual(['all']);
    expect(root.textContent).toContain(
      'Sur le rayon « Chocolat & confiserie », chevauche « Carte 1×1 »',
    );
  });

  it('« Appliquer en mobile » à non : repère sur l’objet, carte 1×1 dans l’aperçu mobile', () => {
    const { fixture, page, root } = setup();
    page.select('example-1');
    page.setSelectedApplyOnMobile(false);
    fixture.detectChanges();
    expect(root.querySelector('.block')?.textContent).toContain('mobile : carte 1×1');
    expect(root.querySelector('.mobile-item')?.textContent).toContain('Carte 1×1');
  });

  it('le panneau ne propose que les côtés permis, et le réglage se voit sur la maquette', () => {
    const { fixture, page, root } = setup();
    page.select('example-2'); // la carte : haut ou plein
    fixture.detectChanges();
    const labels = Array.from(root.querySelectorAll('fold-view-toggle')).map(
      (t) => t.textContent ?? '',
    );
    expect(
      labels.some(
        (text) => text.includes('Haut') && text.includes('Plein') && !text.includes('Gauche'),
      ),
    ).toBe(true);

    page.setSelectedMedia({ side: 'full', fit: 'cover' });
    fixture.detectChanges();
    expect(page.blocks()[1]).toMatchObject({ mediaSide: 'full', mediaFit: 'cover' });
    const mock = root.querySelectorAll('.grid app-storefront-media-mock')[1];
    expect(mock?.classList.contains('side-full')).toBe(true);
  });

  it('l’exemple montre la variété : gauche, droite, plein, et contenir', () => {
    const { root } = setup();
    const mocks = Array.from(root.querySelectorAll('.grid app-storefront-media-mock'));
    expect(mocks.map((m) => Array.from(m.classList).find((c) => c.startsWith('side-')))).toEqual([
      'side-left',
      'side-top',
      'side-right',
      'side-full',
    ]);
    expect(mocks[1]?.querySelector('.media.contain')).not.toBeNull();
  });

  it('l’aperçu mobile met l’image en haut, sauf le plein', () => {
    const { root } = setup();
    const sides = Array.from(root.querySelectorAll('.mobile app-storefront-media-mock')).map((m) =>
      Array.from(m.classList).find((c) => c.startsWith('side-')),
    );
    expect(sides).toEqual(['side-top', 'side-top', 'side-top', 'side-full']);
  });

  it('plusieurs contenus : les réglages paraissent, une durée hors bornes est refusée et dite', () => {
    const { fixture, page, root } = setup();
    page.select('example-1');
    fixture.detectChanges();
    expect(root.textContent).not.toContain('Nombre de contenus');

    page.setSelectedContents('multiple');
    fixture.detectChanges();
    expect(root.textContent).toContain('Nombre de contenus');
    expect(
      root.querySelectorAll('.grid app-storefront-media-mock')[0]?.querySelector('.slide-number'),
    ).not.toBeNull();

    page.setSelectedCarousel({ intervalSeconds: 20 });
    fixture.detectChanges();
    expect(root.textContent).toContain('de 3 à 15 secondes');
    expect(page.blocks()[0]?.carousel).toBeUndefined();
  });

  it('gabarits : enregistrer, refuser un doublon, poser une copie indépendante', () => {
    const { fixture, page, root } = setup();
    page.select('example-3'); // la tuile image à droite
    expect(page.saveSelectedAsTemplate({ name: '  Tuile droite ', description: '' })).toBe(true);
    expect(page.templates()).toEqual([
      // Le ton voyage avec le gabarit (2026-09-24) : la tuile de l'exemple est sombre.
      {
        id: expect.any(String),
        name: 'Tuile droite',
        format: 'tile',
        mediaSide: 'right',
        tone: 'dark',
      },
    ]);

    expect(page.saveSelectedAsTemplate({ name: 'tuile DROITE', description: '' })).toBe(false);
    fixture.detectChanges();
    expect(root.textContent).toContain('Le gabarit « Tuile droite » existe déjà');
    expect(page.templates()).toHaveLength(1);

    const [template] = page.templates();
    if (template === undefined) throw new Error('gabarit absent');
    page.addTemplate(template);
    const placed = page.blocks().at(-1);
    expect(placed).toMatchObject({
      format: 'tile',
      mediaSide: 'right',
      column: 1,
      row: 2,
      shelves: ['all'],
    });

    page.updateTemplate(template.id, { name: 'Autre', description: 'Modifiée' });
    page.deleteTemplate(template.id);
    expect(page.templates()).toEqual([]);
    expect(page.blocks().at(-1)).toEqual(placed);
  });

  it('déplacer un objet garde ses réglages', () => {
    const { page } = setup();
    page.select('example-4');
    page.moveSelected(0, 1);
    expect(page.blocks().find((b) => b.id === 'example-4')).toMatchObject({
      row: 4,
      mediaSide: 'full',
      contents: 'multiple',
    });
  });

  it('le ton : l’exemple montre les trois, et un déplacement le garde', () => {
    const { fixture, page, root } = setup();
    const tones = Array.from(root.querySelectorAll('.grid app-storefront-media-mock')).map((m) =>
      Array.from(m.classList).find((c) => c.startsWith('tone-')),
    );
    expect(tones).toEqual(['tone-light', 'tone-light', 'tone-dark', 'tone-accent']);

    page.select('example-3');
    page.setSelectedTone('accent');
    page.moveSelected(0, 1);
    fixture.detectChanges();
    expect(page.blocks().find((b) => b.id === 'example-3')).toMatchObject({
      row: 2,
      tone: 'accent',
    });
    expect(root.querySelector('.mobile app-storefront-media-mock.tone-accent')).not.toBeNull();
  });

  it('changer de forme : garde les réglages, ou refuse en nommant rayon et objet', () => {
    const { fixture, page, root } = setup();
    page.select('example-3'); // tuile sombre image à droite, colonne 4
    page.setSelectedFormat('band');
    fixture.detectChanges();
    expect(page.blocks().find((b) => b.id === 'example-3')?.format).toBe('tile');
    expect(root.textContent).toContain('Déborde des 5 colonnes');

    page.setSelectedFormat('card');
    expect(page.blocks().find((b) => b.id === 'example-3')).toMatchObject({
      format: 'card',
      column: 4,
      tone: 'dark',
      mediaSide: 'top',
    });

    page.select('example-1'); // tuile en (1,1) : en bloc, elle prend les rangées 1-2, libres
    page.setSelectedFormat('block');
    expect(page.blocks().find((b) => b.id === 'example-1')?.format).toBe('block');
  });
});
