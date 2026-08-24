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
  it('n’offre aucun champ de saisie pour la référence', () => {
    // La référence est ÉMISE par le référentiel : un champ de saisie
    // proposerait d'écrire une valeur que le backend ignore.
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-input')].map(
      (input) => input.getAttribute('label') ?? '',
    );
    expect(labels.some((label) => label.includes('Référence'))).toBe(false);
  });

  it('présente les champs dans l’ordre nom · famille · nature', () => {
    // L'ordre EST le contenu d'une fiche : on nomme la chose, on la range, on
    // dit ce qu'elle est. Le HANDLE n'y figure pas — c'est une URL de boutique
    // en ligne, donc une propriété du canal Shopify, pas de l'identité.
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const grid = (fixture.nativeElement as HTMLElement).querySelector('.grid')!;
    const fields = [...grid.querySelectorAll('fold-input, fold-listbox, fold-field')];
    // Le libellé du nom est une entrée SIGNAL (il nomme la langue en cours),
    // donc aucun attribut ne le reflète — on lit ce que le composant rend.
    const labels = fields.map((el) => el.getAttribute('label') ?? el.textContent?.trim() ?? '');
    expect(labels.length).toBe(3);
    expect(labels[0]).toContain('Nom du produit');
    expect(labels.slice(1)).toEqual(['Famille', 'Nature']);
  });

  it('ne montre aucun champ en lecture — ni référence, ni handle', () => {
    const store = setup();
    store.isEdit.set(true);
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
