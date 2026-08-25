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

describe('RegulatoryForm — l’ordre de la fiche', () => {
  /** Le rang d'un élément dans l'ordre du document, sous l'hôte. */
  function rankOf(host: HTMLElement, element: Element | null | undefined): number {
    return element === null || element === undefined
      ? -1
      : [...host.querySelectorAll('*')].indexOf(element);
  }

  /** Le rang du titre de bloc qui contient ce mot. */
  function headingRank(host: HTMLElement, word: string): number {
    return rankOf(
      host,
      [...host.querySelectorAll('.block-label')].find((label) =>
        (label.textContent ?? '').includes(word),
      ),
    );
  }

  it('pose le poids, puis la nutrition, puis les allergènes', () => {
    // L'ordre n'est pas une préférence d'affichage, c'est celui de la SAISIE :
    // la grille est « pour 100 g », donc elle se remplit à l'aveugle tant que le
    // poids de l'unité n'est pas connu. Rien dans le gabarit ne dit ça — un
    // déplacement de bloc le casserait sans qu'aucun autre test bronche.
    setup();
    const fixture = TestBed.createComponent(RegulatoryForm);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const weight = rankOf(host, host.querySelector('.field-weight'));
    const nutrition = headingRank(host, '100 g');
    const allergens = headingRank(host, 'Allergènes');

    expect(weight).toBeGreaterThanOrEqual(0);
    expect(weight).toBeLessThan(nutrition);
    expect(nutrition).toBeLessThan(allergens);
  });

  it('sépare les deux déclarations par un trait, pas par du vide', () => {
    // L'espace dit « respire » ; le trait dit « autre sujet ». La composition
    // (poids + nutrition) et les allergènes sont deux déclarations distinctes,
    // et rien d'autre dans le gabarit ne le signale.
    setup();
    const fixture = TestBed.createComponent(RegulatoryForm);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const rule = rankOf(host, host.querySelector('.rule'));
    expect(rule).toBeGreaterThan(headingRank(host, '100 g'));
    expect(rule).toBeLessThan(headingRank(host, 'Allergènes'));
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

describe('RegulatoryForm — la grille nutritionnelle', () => {
  /** Le `fold-number-input` dont le libellé contient ce mot. */
  function inputFor(host: HTMLElement, label: string): HTMLInputElement | null {
    const field = [...host.querySelectorAll('fold-number-input')].find((element) =>
      (element.textContent ?? '').includes(label),
    );
    return field?.querySelector('input') ?? null;
  }

  it('écrit chaque champ dans SA clé — et un champ vidé rend `null`, pas zéro', () => {
    // La grille est une collection KEYÉE : chaque champ doit reposer sa propre
    // clé au store. Un câblage qui les confondrait passerait inaperçu à l'œil —
    // les cinq champs se ressemblent — et écrirait les calories dans les
    // lipides. Il faut donc taper dans DEUX champs différents : un seul, et le
    // test passe même si la clé est écrite en dur.
    //
    // Le `null` compte autant : « inconnu » et « zéro » sont deux déclarations
    // réglementaires différentes.
    const store = setup();
    const fixture = TestBed.createComponent(RegulatoryForm);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

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
});
