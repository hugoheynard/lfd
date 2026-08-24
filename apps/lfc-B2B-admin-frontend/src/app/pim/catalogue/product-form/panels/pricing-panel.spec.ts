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

/** Une famille au taux réduit, telle que le référentiel la rend. */
function withFamily(store: ProductFormStore): void {
  store.rates.set([
    {
      id: 'tva_55',
      name: 'Réduit',
      description: '',
      percent: 5.5,
      usage: { emporter: 0, surPlace: 0 },
    },
  ]);
  store.categories.set([
    {
      id: 'cat_tartes',
      name: { fr: 'Tartes' },
      slug: { fr: 'tartes' },
      parentId: null,
      position: 1,
      isArchived: false,
      channelPreset: {
        boutiques: { emp_rivoli: { emporter: true, surPlace: false } },
        b2b: false,
      },
      emporterTvaId: 'tva_55',
      surPlaceTvaId: 'tva_55',
      b2bTvaId: '',
      activeProductCount: 0,
    },
  ]);
  store.categoryId.set('cat_tartes');
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
  it('demande un prix HT — le TTC dépend du mode, il se calcule', () => {
    setup();
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prix HT');
    expect(text).not.toContain('TTC');
  });

  it('montre le régime À CÔTÉ du prix, pas dans une autre section', () => {
    // « 24,50 » et « TVA 5,5 % » sont une seule information : ce qu'on facture.
    // Les séparer obligeait à replier une section pour en déplier une autre.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prix HT');
    expect(text).toContain('Tartes');
    expect(text).toContain('5,5 %');
  });

  it("n'offre pas de « Redéfinir » — l'API neutralise l'override", () => {
    // La maquette en pose un. `channelsOverride` est neutralisé côté API
    // (contexte commerce, tranche 2) : un lien qui n'ouvre rien coûte plus cher
    // que son absence.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Redéfinir');
  });
});
