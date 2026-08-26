import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldDataTableComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { SalesContextsPage } from '../sales-contexts-page/sales-contexts-page';
import { SalesContextAdminStore } from '../sales-context-admin.store';

/**
 * **Le garde-fou des gabarits projetés.**
 *
 * `foldCell` et `foldRowCard` sont captés par des directives. Si elles manquent
 * des `imports` du composant, Angular **ne dit rien** : ce ne sont plus que des
 * attributs inertes sur des `ng-template`, le build reste vert, et l'écran rend
 * des lignes VIDES. C'est arrivé ici — le tableau des taux portait déjà
 * l'avertissement, et je l'ai lu après.
 *
 * Le test ne regarde donc pas le rendu, qui dépend d'une largeur de fenêtre :
 * il vérifie que le tableau a bien REÇU chaque gabarit.
 */
describe('SalesContextsPage', () => {
  function render(canWrite = true): {
    element: HTMLElement;
    table: FoldDataTableComponent<unknown>;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: PermissionsStore, useValue: { can: () => canWrite } },
        {
          provide: SalesContextAdminStore,
          // Une ligne suffit : ce qu'on éprouve, c'est la projection des
          // gabarits, pas le contenu — mais SANS ligne, le tableau ne rend rien
          // et le test passerait sur un écran vide.
          useValue: {
            items: () => [
              {
                key: 'b2b',
                label: 'B2B',
                perLocation: false,
                position: 3,
                active: true,
                shopifyProjected: false,
                handleSuffix: '',
                root: true,
                offeredByLocations: 0,
              },
            ],
            loadError: () => null,
            reload: () => Promise.resolve(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SalesContextsPage);
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

  const table = (): FoldDataTableComponent<unknown> => render().table;

  it('projette une cellule par colonne jusqu’au tableau', () => {
    const data = table();

    for (const key of ['label', 'scope', 'shopify', 'state']) {
      expect(data.cellTemplate(key), `cellule « ${key} » absente`).not.toBeNull();
    }
  });

  it('projette sa carte mobile jusqu’au tableau', () => {
    expect(table().rowCardTemplate()).not.toBeNull();
  });

  /**
   * Écrire le registre est un geste d'ADMIN — `catalog:write`, le seul droit
   * qu'il porte seul. Le front cache, le serveur refuse : ce test évite
   * d'offrir un bouton qui répondrait 403, il ne protège rien.
   */
  it("n'offre aucun geste d'écriture sans le droit", () => {
    const { element, table: data } = render(false);

    expect(element.textContent).not.toContain('Ajouter');
    expect(data.cellTemplate('actions')).toBeNull();
    expect(data.columns().some((column) => column.key === 'actions')).toBe(false);
  });

  it("offre l'ouverture et les actions à qui peut écrire", () => {
    const { element, table: data } = render(true);

    expect(element.textContent).toContain('Ajouter');
    expect(data.cellTemplate('actions')).not.toBeNull();
  });

  /**
   * Il y avait ici un cas « rend la carte, pas une ligne vide ». Il passait pour
   * RIEN : `foldAt` sort tôt quand la largeur mesurée vaut zéro — ce qui est le
   * cas dans jsdom — donc le tableau y rend un TABLEAU, et l'assertion lisait
   * ses cellules. Le vrai défaut était dans la feuille de style de fold, où un
   * test le garde désormais (fold-ng 0.17.1).
   */
});
