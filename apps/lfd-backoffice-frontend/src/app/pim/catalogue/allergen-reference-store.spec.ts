import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import type { AllergenReference, AllergenScope } from '../data/models';
import { AllergenReferenceStore } from './allergen-reference-store';
import { ReferenceApi } from './reference-api';

/** Le serveur, réduit à ce que le store lui demande, et le compte des lectures. */
function setup(answers: (scope: AllergenScope) => Promise<AllergenReference>) {
  const reads: AllergenScope[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ReferenceApi,
        useValue: {
          allergens: (scope: AllergenScope) => {
            reads.push(scope);
            return answers(scope);
          },
        },
      },
    ],
  });
  return { store: TestBed.inject(AllergenReferenceStore), reads };
}

const reference = (scope: AllergenScope): AllergenReference => ({
  scope,
  entries: [{ code: 'GL', label: 'Gluten', incoCategory: null, incoLabel: null }],
});

describe('AllergenReferenceStore — le référentiel, lu une fois par session', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ne relit pas un périmètre déjà lu', async () => {
    const { store, reads } = setup((scope) => Promise.resolve(reference(scope)));

    const first = await store.allergens('eu');
    const second = await store.allergens('eu');

    expect(second).toBe(first);
    expect(reads).toEqual(['eu']);
  });

  it('lit chaque périmètre une fois, eu et world', async () => {
    const { store, reads } = setup((scope) => Promise.resolve(reference(scope)));

    await Promise.all([store.allergens('eu'), store.allergens('world'), store.allergens('world')]);

    expect(reads).toEqual(['eu', 'world']);
  });

  it('relit après un échec : une panne ne se garde pas', async () => {
    let fail = true;
    const { store, reads } = setup((scope) =>
      fail ? Promise.reject(new Error('panne')) : Promise.resolve(reference(scope)),
    );

    await expect(store.allergens('eu')).rejects.toThrow('panne');
    fail = false;
    await expect(store.allergens('eu')).resolves.toEqual(reference('eu'));

    expect(reads).toEqual(['eu', 'eu']);
  });
});
