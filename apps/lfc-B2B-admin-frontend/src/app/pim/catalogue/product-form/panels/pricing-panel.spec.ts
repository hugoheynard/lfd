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
    {
      id: 'tva_20',
      name: 'Normal',
      description: '',
      percent: 20,
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
        b2b: true,
      },
      emporterTvaId: 'tva_55',
      surPlaceTvaId: 'tva_55',
      b2bTvaId: 'tva_20',
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
  it('donne au B2B sa PROPRE ligne, avec son propre taux', () => {
    // Le B2B ne se déduit pas des boutiques : il a son taux, qui peut différer
    // de celui du comptoir. Absent de l'encadré, un produit vendu 20 % aux pros
    // se lisait comme un produit à 5,5 %.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row')];
    const b2b = rows.find((row) => row.querySelector('dt')?.textContent?.includes('B2B'));
    expect(b2b?.textContent).toContain('20 %');
  });
  it('ouvre par le B2B — le comptoir est le cas particulier ici', () => {
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.inherit-row dt')]
      .map((cell) => cell.textContent?.trim() ?? '')
      .filter((label) => label !== '');
    expect(labels[0]).toBe('B2B');
    expect(labels).toEqual(['B2B', 'À emporter', 'Sur place']);
  });

  it('sépare le CHIFFRE du nom du régime', () => {
    // « TVA Réduit · 5,5 % » peignait les deux du même poids, et le chiffre
    // qu'on cherche se perdait au bout de la phrase.
    const store = setup();
    withFamily(store);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    const rate = (fixture.nativeElement as HTMLElement).querySelector('.inherit-rate');
    expect(rate?.querySelector('strong')?.textContent?.trim()).toBe('20 %');
    expect(rate?.querySelector('.inherit-regime')?.textContent?.trim()).toBe('Normal');
  });
});
