import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { NutritionForm } from './nutrition-form';

/**
 * Le magasin d'une fiche EXISTANTE par défaut — c'est là que la section a une
 * grille. `isEdit` vaut `false` sur un magasin neuf, c'est-à-dire « création » :
 * l'oublier ferait passer les tests de la grille sur un écran qui n'en a plus.
 */
function setup(mode: 'creation' | 'edition' = 'edition'): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  const store = TestBed.inject(ProductFormStore);
  store.isEdit.set(mode === 'edition');
  return store;
}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(NutritionForm);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Le `fold-number-input` dont le libellé contient ce mot. */
function inputFor(host: HTMLElement, label: string): HTMLInputElement | null {
  const field = [...host.querySelectorAll('fold-number-input')].find((element) =>
    (element.textContent ?? '').includes(label),
  );
  return field?.querySelector('input') ?? null;
}

describe('NutritionForm', () => {
  it('rend la grille et le poids — et AUCUN allergène', () => {
    setup();
    const text = render().textContent ?? '';

    expect(text).toContain('Calories (kcal)');
    expect(text).toContain('pour 100 g');
    // 🔴 La route refuse (400) un corps qui porte des codes d'allergène : les
    // proposer ici promettrait un enregistrement qui ne se ferait pas.
    expect(text).not.toContain('Aucun allergène');
    expect(text).not.toContain('Peut contenir');
  });

  it('pose le poids AVANT la grille', () => {
    // Pas une préférence d'affichage : la grille est « pour 100 g », donc elle
    // se remplit à l'aveugle tant que le poids de l'unité n'est pas connu.
    setup();
    const host = render();
    const all = [...host.querySelectorAll('*')];

    const weight = all.indexOf(host.querySelector('.field-weight') as Element);
    const grid = all.indexOf(host.querySelector('fold-fieldset') as Element);

    expect(weight).toBeGreaterThanOrEqual(0);
    expect(weight).toBeLessThan(grid);
  });

  it('vit AVEC la déclaration, pas dans « Tarif & TVA »', () => {
    const store = setup();
    store.weightGrams.set(220);

    const host = render();

    expect(host.textContent).toContain('Poids net');
    expect(host.querySelector<HTMLInputElement>('.field-weight input')?.value).toBe('220');
  });

  it('écrit chaque champ dans SA clé — et un champ vidé rend `null`, pas zéro', () => {
    // La grille est une collection KEYÉE : chaque champ doit reposer sa propre
    // clé au store. Un câblage qui les confondrait passerait inaperçu à l'œil —
    // les champs se ressemblent — et écrirait les calories dans les lipides. Il
    // faut donc taper dans DEUX champs différents : un seul, et le test passe
    // même si la clé est écrite en dur.
    //
    // Le `null` compte autant : « inconnu » et « zéro » sont deux déclarations
    // réglementaires différentes.
    const store = setup();
    const host = render();

    const carbs = inputFor(host, 'Glucides');
    const calories = inputFor(host, 'Calories');
    expect(carbs).not.toBeNull();
    expect(calories).not.toBeNull();
    if (carbs === null || calories === null) {
      return;
    }

    carbs.value = '42';
    carbs.dispatchEvent(new Event('input'));
    calories.value = '310';
    calories.dispatchEvent(new Event('input'));

    expect(store.nutrition().carbsG).toBe(42);
    expect(store.nutrition().energyKcal).toBe(310);

    carbs.value = '';
    carbs.dispatchEvent(new Event('input'));
    expect(store.nutrition().carbsG).toBeNull();
    expect(store.nutrition().energyKcal).toBe(310);
  });

  /**
   * L'héritage de la NUTRITION grise la grille, jamais le poids : celui-ci
   * voyage par la route du tarif et suit le drapeau du tarif.
   */
  it('grise la grille quand la nutrition est alignée, et laisse le poids', () => {
    const store = setup();
    store.nutritionAligned.set(true);

    const host = render();

    expect(host.querySelector('fold-fieldset')?.classList.contains('is-inherited')).toBe(true);
    expect(host.querySelector('.field-weight')?.classList.contains('is-inherited')).toBe(false);
  });

  /**
   * 🔴 `saveNutrition` SAUTE l'écriture du poids quand le tarif est aligné — il
   * part par la route du tarif, qui poserait sinon un prix propre que personne
   * n'a saisi. Un champ resté saisissable aurait donc accepté la frappe et jeté
   * la valeur : « un no-op silencieux a l'exacte apparence d'un succès ».
   */
  it('ferme le poids quand le TARIF est aligné, et dit pourquoi', () => {
    const store = setup();
    store.pricingAligned.set(true);

    const host = render();

    expect(host.querySelector<HTMLInputElement>('.field-weight input')?.disabled).toBe(true);
    expect(host.querySelector('.field-weight')?.textContent).toContain('Tarif & TVA');
  });

  it('laisse le poids saisissable quand le tarif ne l’est pas', () => {
    const store = setup();
    store.pricingAligned.set(false);

    const host = render();

    expect(host.querySelector<HTMLInputElement>('.field-weight input')?.disabled).toBe(false);
  });

  /**
   * 🔴 `createProduct` ne porte AUCUNE valeur nutritionnelle. La grille rendue à
   * la création acceptait huit nombres et les perdait sans un mot.
   *
   * Le poids, lui, RESTE : la création l'enregistre (`weightGrams` est dans le
   * corps de `createProduct`). Le retirer avec la grille supprimerait un champ
   * qui fonctionne.
   */
  it('à la création : pas de grille, une phrase, et le poids conservé', () => {
    setup('creation');

    const host = render();

    expect(host.querySelector('fold-fieldset')).toBeNull();
    expect(host.textContent).toContain('une fois le brouillon créé');
    expect(host.querySelector('.field-weight')).not.toBeNull();
  });

  it('à l’édition : la grille est là', () => {
    setup('edition');

    expect(render().textContent).toContain('Calories (kcal)');
  });
});
