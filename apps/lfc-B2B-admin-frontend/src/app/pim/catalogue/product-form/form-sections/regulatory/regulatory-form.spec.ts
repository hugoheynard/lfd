import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { RegulatoryForm } from './regulatory-form';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('RegulatoryForm', () => {
  it('rend les valeurs nutritionnelles et le sélecteur allergènes', () => {
    setup();
    const fixture = TestBed.createComponent(RegulatoryForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Calories (kcal)');
    expect(text).toContain('Aucun allergène');
  });

  // Le bouton d'enregistrement a QUITTÉ le panneau : il vit dans l'en-tête de la
  // section (`app-section-state`), à droite de son titre, et n'apparaît qu'à la
  // première frappe. Un panneau qui garderait le sien en poserait un SECOND —
  // c'est très exactement les « sept boutons d'enregistrement dispersés » que la
  // refonte devait supprimer, et ils avaient survécu à l'arrivée du premier.
  it('ne porte aucun bouton d’enregistrement — il vit dans l’en-tête de section', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(RegulatoryForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.section-footer')).toBeNull();
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Enregistrer'))).toBe(false);
  });
});

describe('RegulatoryForm — le poids net', () => {
  it('vit AVEC la déclaration, pas dans « Tarif & TVA »', () => {
    // La grille est « pour 100 g » : sans le poids de l'unité, elle ne dit rien
    // de ce qu'on vend. Isolé ailleurs dans la page, son absence ne se voyait
    // pas en contexte.
    const store = setup();
    store.weightGrams.set(220);
    const fixture = TestBed.createComponent(RegulatoryForm);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Poids net');
    const weight = host.querySelector<HTMLInputElement>('.field-weight input');
    expect(weight?.value).toBe('220');
  });
});
