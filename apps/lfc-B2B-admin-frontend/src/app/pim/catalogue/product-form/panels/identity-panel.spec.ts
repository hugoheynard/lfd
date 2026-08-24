import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { IdentityPanel } from './identity-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('IdentityPanel', () => {
  // La référence est ÉMISE par le référentiel. Un champ de saisie proposerait
  // d'écrire une valeur que le backend n'écoute plus — et inviterait au doublon.
  it('n’offre aucun champ de saisie pour la référence ni pour le slug', () => {
    // Les deux sont ÉMIS par le référentiel. Un champ de saisie proposerait
    // d'écrire une valeur que le backend ignore — et, pour le slug, qu'il
    // refuse même de bouger après création.
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-input')].map(
      (input) => input.getAttribute('label') ?? '',
    );
    expect(labels.some((label) => label.includes('Référence'))).toBe(false);
    expect(labels.some((label) => label.includes('Slug'))).toBe(false);
  });

  it('présente les champs dans l’ordre nom · famille · nature · slug', () => {
    // L'ordre EST le contenu d'une fiche : on nomme la chose, on la range, on
    // dit ce qu'elle est, puis on lit ce que le référentiel en a fait.
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const grid = (fixture.nativeElement as HTMLElement).querySelector('.grid')!;
    const fields = [...grid.querySelectorAll('fold-input, fold-listbox, fold-field')];
    // Le libellé du nom est une entrée SIGNAL (il nomme la langue en cours),
    // donc aucun attribut ne le reflète — on lit ce que le composant rend.
    const labels = fields.map((el) => el.getAttribute('label') ?? el.textContent?.trim() ?? '');
    expect(labels.length).toBe(4);
    expect(labels[0]).toContain('Nom du produit');
    expect(labels.slice(1)).toEqual(['Famille', 'Nature', 'Slug']);
  });

  it('dit que le slug manque plutôt que d’en inventer un', () => {
    // Le handle naît de la première publication. Afficher un slug « proposé »
    // prétendrait connaître l'algorithme du serveur, et mentirait le jour où
    // les deux divergent.
    const store = setup();
    store.isEdit.set(true);
    store.setName('Tarte au citron meringuée');
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const field = (fixture.nativeElement as HTMLElement).querySelector('fold-field');
    expect(field?.textContent).toContain('attribué à la première publication');
    expect(field?.textContent).not.toContain('tarte');
  });

  it('ne montre ni slug ni référence en création', () => {
    const store = setup();
    store.isEdit.set(false);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('fold-field')).toBeNull();
  });

  // Le bouton d'enregistrement a QUITTÉ le panneau : il vit dans l'en-tête de la
  // section (`app-section-state`), à droite de son titre, et n'apparaît qu'à la
  // première frappe. Un panneau qui garderait le sien en poserait un SECOND —
  // c'est très exactement les « sept boutons d'enregistrement dispersés » que la
  // refonte devait supprimer, et ils avaient survécu à l'arrivée du premier.
  it('ne porte aucun bouton d’enregistrement — il vit dans l’en-tête de section', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.section-footer')).toBeNull();
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Enregistrer'))).toBe(false);
  });
});
