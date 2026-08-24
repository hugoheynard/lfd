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
    store.name.set('Tarte au citron meringuée');
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

  it('ne laisse pas de séparateur orphelin quand un fait manque', () => {
    // La famille n'est pas encore connue (référentiel non chargé) et il n'y a
    // aucune déclinaison : la ligne doit se lire « TYPE » seul, sans « · · ».
    const { root } = render(true);
    const line = root.querySelector('.ident')?.textContent ?? '';
    expect(line).not.toContain('··');
    expect(root.querySelectorAll('.ident-sep').length).toBe(1);
    expect(root.querySelector('.ident')?.textContent).toContain('Frais du jour');
  });

  it('propose Publier et Archiver sur un brouillon, jamais Dépublier', () => {
    const { root } = render(true);
    const items = [...root.querySelectorAll('fold-dropdown-item')].map(
      (item) => item.textContent?.trim() ?? '',
    );
    expect(items).toContain('Publier');
    expect(items).toContain('Archiver');
    expect(items).not.toContain('Dépublier');
  });

  it('en création : ni pastille, ni menu — le produit n’existe pas encore', () => {
    const { root } = render(false);
    expect(root.querySelector('.page-title-badge fold-badge')).toBeNull();
    expect(root.querySelector('fold-dropdown')).toBeNull();
    // …et la ligne sous le titre redevient une consigne, pas des faits.
    expect(root.querySelector('.ident')).toBeNull();
    expect(root.querySelector('.page-desc')?.textContent).toContain(
      'Un nom et une catégorie suffisent',
    );
  });
});
