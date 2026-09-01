import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ProductFormPage } from './product-form-page';
import { ProductFormStore } from './product-form-store';

/**
 * L'en-tête de la fiche produit — la rangée que la page projette dans
 * `fold-page-layout`. Les requêtes du store restent en attente (aucun `flush`) :
 * l'en-tête se peint sans elles, et c'est justement ce qu'on vérifie.
 */
function render(edit: boolean) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(ProductFormPage);
  const store = fixture.debugElement.injector.get(ProductFormStore);
  store.isEdit.set(edit);
  store.loading.set(false);
  fixture.detectChanges();
  return { fixture, store, root: fixture.nativeElement as HTMLElement };
}

describe('ProductFormPage — en-tête', () => {
  it('porte le nom du produit comme titre, pas le geste qu’on y fait', () => {
    const { fixture, store, root } = render(true);
    store.setName('Tarte au citron meringuée');
    fixture.detectChanges();
    expect(root.querySelector('.page-title')?.textContent).toContain('Tarte au citron meringuée');
    expect(root.querySelector('.page-title')?.textContent).not.toContain('Éditer');
  });

  it('affiche l’état de publication en pastille à côté du titre', () => {
    const { root } = render(true);
    const badge = root.querySelector('.page-title-badge fold-badge');
    // `content` et `variant` sont des entrées signal : rien ne les reflète en
    // attribut. On lit donc ce que la pastille REND — le texte, et la classe que
    // `fold-badge` pose depuis sa variante.
    expect(badge?.textContent?.trim()).toBe('Brouillon');
    expect(badge?.classList.contains('warning')).toBe(true);
  });

  it('pose la ligne de faits dans [pageSubtitle], jamais dans la description', () => {
    // Les deux créneaux se ressemblent assez pour que l'erreur passe : une ligne
    // de faits dans `[description]` prend l'espacement d'un paragraphe et se
    // détache du titre qu'elle identifie.
    const { root } = render(true);
    expect(root.querySelector('.page-subtitle .ident')).not.toBeNull();
    expect(root.querySelector('.page-desc .ident')).toBeNull();
  });

  it('ferme l’en-tête sur un filet — le corps arrive au ras', () => {
    const { root } = render(true);
    expect(root.querySelector('fold-page-layout')?.hasAttribute('data-separator')).toBe(true);
  });

  it('ne peint AUCUNE bande — la carte porte l’élévation', () => {
    // Deux sols qui disent « ceci n'est pas le contenu » se disputent le même
    // rôle : la carte qui tient les sections le dit déjà, et mieux.
    const { root } = render(true);
    const layout = root.querySelector('fold-page-layout');
    expect(layout?.hasAttribute('data-header-band')).toBe(false);
    expect(root.querySelector('fold-aside-layout')?.hasAttribute('data-band')).toBe(false);
    // La PORTÉE reste : c'est elle qui fait courir le filet sur toute la largeur.
    expect(layout?.hasAttribute('data-header-bleed')).toBe(true);
  });

  it('expose le rail comme un repère nommé, pas comme une région anonyme', () => {
    const { root } = render(true);
    const rail = root.querySelector('[role="complementary"]');
    expect(rail?.getAttribute('aria-label')).toBe('Publication');
  });

  it('ne laisse pas de séparateur orphelin quand un fait manque', () => {
    // La famille n'est pas encore connue (référentiel non chargé) et il n'y a
    // aucune déclinaison : la ligne doit se lire « TYPE » seul, sans « · · ».
    const { root } = render(true);
    const line = root.querySelector('.ident')?.textContent ?? '';
    expect(line).not.toContain('··');
    expect(root.querySelectorAll('.ident-sep').length).toBe(1);
    expect(root.querySelector('.ident')?.textContent).toContain('Frais du jour');
  });

  /**
   * Le cycle de vie a quitté le menu ⋮ de l'en-tête pour le RAIL, sous la
   * complétude qui le conditionne. Il vivait à l'autre bout de l'écran, sans
   * lien visible avec ce qui décide s'il est permis.
   */
  it('ne garde plus de menu d’actions dans l’en-tête', () => {
    const { root } = render(true);

    expect(root.querySelector('fold-dropdown')).toBeNull();
  });

  it('propose la publication sur un brouillon, jamais la dépublication', () => {
    const { root } = render(true);
    const actions = [...root.querySelectorAll('app-publish-rail button')].map(
      (button) => button.textContent?.trim() ?? '',
    );

    expect(actions).toContain('Publier au catalogue');
    expect(actions).toContain('Archiver');
    expect(actions).not.toContain('Dépublier');
  });

  it('pose le retour AU-DESSUS du titre, dans l’en-tête', () => {
    const { root } = render(true);
    const back = root.querySelector('.page-eyebrow fold-back-link');
    expect(back).not.toBeNull();
    // Le corps ne doit RIEN en recevoir : sans le créneau, un contenu projeté
    // tombe en silence dans le corps, et l'erreur ne se voit qu'à l'œil.
    expect(root.querySelector('.page-body fold-back-link')).toBeNull();
  });

  it('mène à la liste des produits, avec une flèche', () => {
    const { root } = render(true);
    const anchor = root.querySelector<HTMLAnchorElement>('fold-back-link a');
    expect(anchor?.getAttribute('href')).toBe('/pim/produits');
    expect(anchor?.textContent?.trim()).toBe('Produits');
    // Une FLÈCHE, pas un chevron : le chevron ouvre, la flèche remonte. `name`
    // est une entrée signal, donc rien ne le reflète en attribut — mais
    // `fold-icon` rend un `<use>` vers le sprite, qui NOMME l'icône choisie.
    expect(root.querySelector('fold-back-link svg use')?.getAttribute('href')).toBe(
      '#fold-icon-arrow-back',
    );
  });

  it('en création : ni pastille, ni menu — le produit n’existe pas encore', () => {
    const { root } = render(false);
    expect(root.querySelector('.page-title-badge fold-badge')).toBeNull();
    expect(root.querySelector('fold-dropdown')).toBeNull();
    // …et la ligne sous le titre redevient une consigne — de la PROSE, donc la
    // description, pas le sous-titre.
    expect(root.querySelector('.ident')).toBeNull();
    expect(root.querySelector('.page-subtitle')?.textContent?.trim() ?? '').toBe('');
    expect(root.querySelector('.page-desc')?.textContent).toContain(
      'Un nom et une catégorie suffisent',
    );
  });

  it('replie ses sections, sans jamais replier leur état', () => {
    // La refonte est partie de « aucune section n'est cachée » : les onglets
    // cachaient l'état AVEC les champs. Replier reste compatible avec ça tant
    // que la tête ne se replie pas — sinon on a réinventé les onglets.
    const { fixture, root } = render(true);
    const sections = [...root.querySelectorAll('fold-page-section')];
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((s) => s.hasAttribute('data-collapsible'))).toBe(true);

    const first = sections[0]!;
    first.querySelector<HTMLButtonElement>('.section-toggle')!.click();
    fixture.detectChanges();

    expect(first.querySelector<HTMLElement>('.section-body')!.hidden).toBe(true);
    // …et l'état de la section est TOUJOURS là, repliée.
    expect(first.querySelector('.section-title-text')).not.toBeNull();
    expect(first.querySelector('.section-actions app-section-state')).not.toBeNull();
  });

  it('retient les sections repliées d’une visite à l’autre', () => {
    // Le pli est un CHOIX : le perdre au rechargement le transforme en geste à
    // refaire, et huit sections font huit gestes.
    localStorage.clear();
    const first = render(true);
    const section = first.root.querySelector('fold-page-section')!;
    section.querySelector<HTMLButtonElement>('.section-toggle')!.click();
    first.fixture.detectChanges();
    expect(section.querySelector<HTMLElement>('.section-body')!.hidden).toBe(true);

    // Une page NEUVE : c'est le stockage qui doit porter le choix.
    TestBed.resetTestingModule();
    const second = render(true);
    const reopened = second.root.querySelector('fold-page-section')!;
    expect(reopened.querySelector<HTMLElement>('.section-body')!.hidden).toBe(true);
    localStorage.clear();
  });

  it('donne à CHAQUE section sa carte', () => {
    // La carte unique tenait sur l'idée que le filet d'en-tête suffit à séparer
    // deux sujets. À l'usage, non : il fallait 32px d'écart pour que la
    // séparation se voie, et ce vide DANS une boîte se lisait comme un trou.
    const { root } = render(true);
    const sections = [...root.querySelectorAll('fold-page-section')];
    expect(sections.length).toBeGreaterThan(1);
    // Une carte par section, et aucune partagée — on compare les parents plutôt
    // que de compter les cartes de la page, dont le rail de publication a les
    // siennes.
    const cards = sections.map((section) => section.closest('fold-card'));
    expect(cards.every((card) => card !== null)).toBe(true);
    expect(new Set(cards).size).toBe(sections.length);
  });
});
