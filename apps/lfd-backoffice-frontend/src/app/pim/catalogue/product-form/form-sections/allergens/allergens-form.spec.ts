import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { AllergenEntry } from '../../../../data/models';
import { ProductFormStore } from '../../product-form-store';
import { AllergensForm } from './allergens-form';

/** Un extrait fidèle du référentiel : une vraie catégorie, deux solitaires. */
const REFERENCE: AllergenEntry[] = [
  { code: 'UW', label: 'Blé', incoCategory: 'gluten', incoLabel: 'Céréales contenant du gluten' },
  {
    code: 'NR',
    label: 'Seigle',
    incoCategory: 'gluten',
    incoLabel: 'Céréales contenant du gluten',
  },
  { code: 'AM', label: 'Lait', incoCategory: 'milk', incoLabel: 'Lait' },
  {
    code: 'AU',
    label: 'Anhydride sulfureux et sulfites',
    incoCategory: 'sulphites',
    incoLabel: 'Anhydride sulfureux et sulfites',
  },
];

/** Les légendes des groupes d'allergènes, dans l'ordre. */
function legends(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.groups legend')].map((l) => (l.textContent ?? '').trim());
}

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

function render(store: ProductFormStore): HTMLElement {
  store.entries.set(REFERENCE);
  const fixture = TestBed.createComponent(AllergensForm);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AllergensForm', () => {
  it('rend l’affirmation, les cases et les traces — et AUCUNE valeur nutritionnelle', () => {
    const store = setup();
    const text = render(store).textContent ?? '';

    expect(text).toContain('Aucun allergène');
    expect(text).toContain('Peut contenir');
    // 🔴 La séparation se voit à l'écran ou elle n'existe pas : une calorie
    // saisie ici repartirait par la route qui les refuse.
    expect(text).not.toContain('Calories');
    expect(text).not.toContain('Poids net');
  });

  // Le bouton d'enregistrement vit dans l'en-tête de la section
  // (`app-section-state`), à droite de son titre. Un panneau qui garderait le
  // sien en poserait un SECOND — les « sept boutons dispersés » que la refonte
  // devait supprimer.
  it('ne porte aucun bouton d’enregistrement — il vit dans l’en-tête de section', () => {
    const store = setup();
    store.isEdit.set(true);
    const root = render(store);

    expect(root.querySelector('.section-footer')).toBeNull();
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Enregistrer'))).toBe(false);
  });

  it("n'encadre que les catégories qui groupent VRAIMENT", () => {
    // Une boîte intitulée « Lait » contenant une seule case « Lait » disait
    // deux fois la même chose, et douze fois de suite.
    expect(legends(render(setup()))).toEqual(['Céréales contenant du gluten', 'Autres allergènes']);
  });

  it('garde le libellé d’ÉTIQUETTE pour une substance seule', () => {
    // « Sulfites » est notre abrégé ; c'est « Anhydride sulfureux et sulfites »
    // qui doit figurer sur l'emballage.
    const text = render(setup()).textContent ?? '';

    expect(text).toContain('Anhydride sulfureux et sulfites');
    expect(text).toContain('Lait');
  });

  it('coche une substance seule sous son propre code', () => {
    const store = setup();
    const fixture = TestBed.createComponent(AllergensForm);
    store.entries.set(REFERENCE);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const box = [...host.querySelectorAll('input[type="checkbox"]')].find((input) =>
      (input.closest('label')?.textContent ?? '').includes('Anhydride'),
    );

    (box as HTMLInputElement).click();
    fixture.detectChanges();

    // Le code du référentiel, pas celui de la catégorie qui l'accueillait.
    expect(store.selected()).toContain('AU');
  });

  /**
   * 🔴 Les traces restent visibles sous « aucun allergène ». Ne rien contenir
   * et pouvoir porter une trace d'atelier sont deux faits différents, et c'est
   * le second qui s'imprime en petit sur l'étiquette.
   */
  it('montre les traces même quand « aucun allergène » est coché', () => {
    const store = setup();
    store.declareNoAllergen(true);

    const host = render(store);

    expect(host.querySelector('fold-multiselect')).not.toBeNull();
    // Les cases de présence, elles, disparaissent : la question est fermée.
    expect(host.querySelector('.groups')).toBeNull();
  });

  /**
   * Le serveur refuse un code déclaré à la fois présent et en trace. Le
   * contrôle ne le propose donc pas — on rend le 400 inatteignable plutôt que
   * de le traduire.
   */
  it('ne propose pas en trace un allergène déjà déclaré présent', () => {
    const store = setup();
    store.entries.set(REFERENCE);
    store.toggleAllergen('AM', true);

    const offered = JSON.stringify(store.traceChoices());

    expect(offered).not.toContain('"AM"');
    expect(offered).toContain('"AU"');
  });
});
