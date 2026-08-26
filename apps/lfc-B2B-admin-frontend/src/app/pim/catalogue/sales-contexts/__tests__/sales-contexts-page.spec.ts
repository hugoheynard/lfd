import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldDataTableComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

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
  function table(): FoldDataTableComponent<unknown> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
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
                channelKey: 'b2b',
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
    return found.componentInstance as FoldDataTableComponent<unknown>;
  }

  it('projette une cellule par colonne jusqu’au tableau', () => {
    const data = table();

    for (const key of ['label', 'scope', 'shopify', 'state']) {
      expect(data.cellTemplate(key), `cellule « ${key} » absente`).not.toBeNull();
    }
  });

  it('projette sa carte mobile jusqu’au tableau', () => {
    expect(table().rowCardTemplate()).not.toBeNull();
  });
});
