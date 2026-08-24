import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { PricingPanel } from './pricing-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('PricingPanel', () => {
  // Le bouton d'enregistrement a QUITTÉ le panneau : il vit dans l'en-tête de la
  // section (`app-section-state`), à droite de son titre, et n'apparaît qu'à la
  // première frappe. Un panneau qui garderait le sien en poserait un SECOND —
  // c'est très exactement les « sept boutons d'enregistrement dispersés » que la
  // refonte devait supprimer, et ils avaient survécu à l'arrivée du premier.
  it('ne porte aucun bouton d’enregistrement — il vit dans l’en-tête de section', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.section-footer')).toBeNull();
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Enregistrer'))).toBe(false);
  });
});
