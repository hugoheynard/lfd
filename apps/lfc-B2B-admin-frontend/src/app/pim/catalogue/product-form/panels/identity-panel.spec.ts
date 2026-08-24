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
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-input')].map(
      (input) => input.getAttribute('label') ?? '',
    );
    expect(labels.some((label) => label.includes('Référence'))).toBe(false);
  });

  it('affiche la référence en lecture une fois le produit créé', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();

    const field = (fixture.nativeElement as HTMLElement).querySelector('fold-field');
    expect(field?.getAttribute('label')).toBe('Référence');
  });

  // Rien à montrer tant que le produit n'existe pas : la référence naît avec lui.
  it('ne montre pas de référence en création', () => {
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
