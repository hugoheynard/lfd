import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { AllergenReference, AllergenScope } from '../../../data/models';
import { ReferenceApi } from '../../reference-api';
import { ProductFormStore } from '../product-form-store';

/**
 * Le catalogue affiché doit être celui que le sélecteur annonce.
 *
 * Tant que le référentiel était une liste en dur, ce chargement ne pouvait pas
 * échouer et la question ne se posait pas. Il vient maintenant du serveur : un
 * échec laisserait le bouton sur « Monde » au-dessus des entrées « UE », c'est
 * à dire un écran réglementaire qui ment sur ce qu'il montre — sans rien dire.
 */
const EU: AllergenReference = {
  scope: 'eu',
  entries: [{ code: 'AM', label: 'Lait', incoCategory: 'milk', incoLabel: 'Lait' }],
};

/** Armé par {@link failNext}, il fait échouer le prochain chargement. */
let refuse = false;
function failNext(): void {
  refuse = true;
}

function setup(onWorld: () => Promise<AllergenReference>): ProductFormStore {
  refuse = false;
  TestBed.configureTestingModule({
    providers: [
      ProductFormStore,
      provideHttpClient(),
      {
        provide: ReferenceApi,
        useValue: {
          allergens: (scope: AllergenScope): Promise<AllergenReference> => {
            if (refuse) {
              return Promise.reject(new Error('503'));
            }
            return scope === 'eu' ? Promise.resolve(EU) : onWorld();
          },
        },
      },
    ],
  });
  return TestBed.inject(ProductFormStore);
}

describe('le catalogue allergènes', () => {
  it('bascule quand le serveur a répondu', async () => {
    const store = setup(() =>
      Promise.resolve({
        scope: 'world',
        entries: [
          ...EU.entries,
          { code: 'BWD', label: 'Sarrasin', incoCategory: null, incoLabel: null },
        ],
      }),
    );

    await store.changeScope('world');

    expect(store.scope()).toBe('world');
    expect(store.entries().map((e) => e.code)).toEqual(['AM', 'BWD']);
  });

  it('REVIENT au catalogue précédent quand le serveur refuse', async () => {
    // On part d'un état RÉEL : « Monde » chargé, puis le retour vers « UE »
    // échoue. Partir de l'état initial ne prouverait rien — le store démarre
    // déjà sur « UE », et la bascule y serait un non-geste.
    const store = setup(() =>
      Promise.resolve({
        scope: 'world' as const,
        entries: [
          ...EU.entries,
          { code: 'BWD', label: 'Sarrasin', incoCategory: null, incoLabel: null },
        ],
      }),
    );
    await store.changeScope('world');
    failNext();

    await store.changeScope('eu');

    // Le sélecteur ne peut pas annoncer un catalogue qu'on n'a pas reçu.
    expect(store.scope()).toBe('world');
    expect(store.entries().map((e) => e.code)).toEqual(['AM', 'BWD']);
    expect(store.error()).not.toBeNull();
  });
});
