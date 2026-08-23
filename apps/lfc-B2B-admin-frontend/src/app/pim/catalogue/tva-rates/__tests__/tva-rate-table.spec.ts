import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FoldDataTableComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { TvaRateTable } from '../tva-rate-table/tva-rate-table';

/**
 * Le garde-fou de la vue mobile.
 *
 * `narrowLayout="cards"` cache le tableau et rend le `foldRowCard` projeté. Si
 * la directive qui capte ce template manque des `imports` du composant, Angular
 * **ne dit rien** — `foldRowCard` reste un attribut inerte sur un `ng-template`,
 * le build passe, et le téléphone affiche le vide. C'est arrivé.
 *
 * Le test ne regarde donc pas le rendu, qui dépend d'une largeur : il vérifie
 * que le tableau a bien REÇU la carte.
 */
describe('TvaRateTable', () => {
  it('projette sa carte mobile jusqu’au tableau', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const fixture = TestBed.createComponent(TvaRateTable);
    fixture.detectChanges();

    const table = fixture.debugElement.children[0]?.componentInstance;
    expect(table).toBeInstanceOf(FoldDataTableComponent);
    expect((table as FoldDataTableComponent<unknown>).rowCardTemplate()).not.toBeNull();
  });
});
