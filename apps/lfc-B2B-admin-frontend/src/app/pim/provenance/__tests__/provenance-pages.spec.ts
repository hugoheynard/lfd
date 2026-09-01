import { provideHttpClient } from '@angular/common/http';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { AppellationView, IngredientView } from '@lfd/pim-contracts';
import { FoldDataTableComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AppellationsPage } from '../appellations-page/appellations-page';
import { IngredientsPage } from '../ingredients-page/ingredients-page';
import { ProvenanceStore } from '../provenance.store';

/**
 * **Le garde-fou des gabarits projetés.**
 *
 * `foldCell` et `foldRowCard` sont captés par des directives. Si elles manquent
 * des `imports` du composant, Angular **ne dit rien** : ce ne sont plus que des
 * attributs inertes sur des `ng-template`, le build reste vert, et l'écran rend
 * des lignes VIDES. Le test ne regarde donc pas le rendu — qui dépend d'une
 * largeur de fenêtre — mais que le tableau a bien REÇU chaque gabarit.
 */
const AOP: AppellationView = {
  code: 'aop-beaufort',
  label: { fr: 'Beaufort' },
  scheme: 'AOP',
  active: true,
  usedBy: 1,
};

const BEURRE: IngredientView = {
  key: 'beurre-de-savoie',
  name: { fr: 'Beurre de Savoie' },
  description: null,
  origin: 'Savoie, France',
  appellation: AOP,
  allergens: [],
  usedBy: 2,
};

function setup(canWrite: boolean): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: PermissionsStore, useValue: { can: () => canWrite } },
      {
        provide: ProvenanceStore,
        // Une ligne suffit : ce qu'on éprouve est la projection des gabarits,
        // pas le contenu — mais SANS ligne, le tableau ne rend rien et le test
        // passerait sur un écran vide.
        useValue: {
          appellations: () => [AOP],
          ingredients: () => [BEURRE],
          offeredAppellations: () => [AOP],
          appellationError: () => null,
          ingredientError: () => null,
          reload: () => Promise.resolve(),
          reloadAppellations: () => Promise.resolve(),
          reloadIngredients: () => Promise.resolve(),
        },
      },
    ],
  });
}

function render<T>(
  page: Type<T>,
  canWrite = true,
): { element: HTMLElement; table: FoldDataTableComponent<unknown> } {
  setup(canWrite);
  const fixture = TestBed.createComponent(page);
  fixture.detectChanges();
  const found = fixture.debugElement.query(By.directive(FoldDataTableComponent));
  if (found === null) {
    throw new Error('tableau introuvable');
  }
  return {
    element: fixture.nativeElement as HTMLElement,
    table: found.componentInstance as FoldDataTableComponent<unknown>,
  };
}

describe('AppellationsPage', () => {
  it('projette une cellule par colonne jusqu’au tableau', () => {
    const { table } = render(AppellationsPage);

    for (const key of ['label', 'scheme', 'used', 'state']) {
      expect(table.cellTemplate(key), `cellule « ${key} » absente`).not.toBeNull();
    }
    expect(table.rowCardTemplate()).not.toBeNull();
  });

  it("n'offre aucun geste d'écriture sans le droit", () => {
    const { element, table } = render(AppellationsPage, false);

    expect(element.textContent).not.toContain('Ajouter');
    expect(table.cellTemplate('actions')).toBeNull();
    expect(table.columns().some((column) => column.key === 'actions')).toBe(false);
  });
});

describe('IngredientsPage', () => {
  it('projette une cellule par colonne jusqu’au tableau', () => {
    const { table } = render(IngredientsPage);

    for (const key of ['name', 'origin', 'appellation', 'allergens', 'used']) {
      expect(table.cellTemplate(key), `cellule « ${key} » absente`).not.toBeNull();
    }
    expect(table.rowCardTemplate()).not.toBeNull();
  });

  /**
   * La page doit DIRE ce qu'elle n'est pas. Un écran nommé « Ingrédients » à
   * côté d'une section « Allergènes » invite à y voir la liste réglementaire ;
   * l'y prendre produirait une mention obligatoire fausse, puisque rien ici ne
   * garantit ni l'exhaustivité ni l'ordre par masse.
   */
  it('avertit que ce n’est pas la liste réglementaire', () => {
    const { element } = render(IngredientsPage);

    expect(element.textContent).toContain('liste réglementaire');
  });

  it("n'offre aucun geste d'écriture sans le droit", () => {
    const { element, table } = render(IngredientsPage, false);

    expect(element.textContent).not.toContain('Ajouter');
    expect(table.cellTemplate('actions')).toBeNull();
  });
});
