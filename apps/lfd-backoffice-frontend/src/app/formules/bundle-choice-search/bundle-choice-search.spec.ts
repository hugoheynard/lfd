import { TestBed } from '@angular/core/testing';
import type { BundleChoiceCandidateView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BundlesService } from '../bundles.service';
import { BundleChoiceSearch } from './bundle-choice-search';

const CROISSANT: BundleChoiceCandidateView = {
  sku: 'CROI-1',
  name: 'Croissant',
  shelf: 'Viennoiseries',
  thumbnailUrl: null,
};
const PAIN: BundleChoiceCandidateView = { ...CROISSANT, sku: 'PAIN-1', name: 'Pain au chocolat' };

function setup(searchChoices: (term: string) => Promise<readonly BundleChoiceCandidateView[]>) {
  const terms: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BundlesService,
        useValue: {
          searchChoices: (term: string) => {
            terms.push(term);
            return searchChoices(term);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BundleChoiceSearch);
  fixture.componentRef.setInput('taken', ['CROI-1']);
  fixture.detectChanges();
  const picked: BundleChoiceCandidateView[] = [];
  fixture.componentInstance.picked.subscribe((candidate) => picked.push(candidate));
  return { search: fixture.componentInstance, terms, picked, fixture };
}

describe('BundleChoiceSearch', () => {
  it('cherche au serveur et ne propose pas ce que le groupe a déjà', async () => {
    const { search, terms } = setup(async () => [CROISSANT, PAIN]);
    await search['search']('pain');
    expect(terms).toEqual(['pain']);
    expect(search['options']()).toEqual([
      { value: 'PAIN-1', label: 'Pain au chocolat · Viennoiseries' },
    ]);
    expect(search['hint']()).toBe('1 article à ajouter.');
  });

  it('rend l’article choisi, entier', async () => {
    const { search, picked } = setup(async () => [PAIN]);
    await search['search']('pain');
    search['pick']('PAIN-1');
    expect(picked).toEqual([PAIN]);
  });

  it('un terme vide n’appelle pas le serveur', async () => {
    const { search, terms } = setup(async () => [PAIN]);
    await search['search']('');
    expect(terms).toEqual([]);
    expect(search['options']()).toEqual([]);
  });

  it('une réponse périmée ne remplace pas la dernière', async () => {
    let releaseSlow: (value: readonly BundleChoiceCandidateView[]) => void = () => undefined;
    const { search } = setup((term) =>
      term === 'lent' ? new Promise((resolve) => (releaseSlow = resolve)) : Promise.resolve([PAIN]),
    );
    const slow = search['search']('lent');
    await search['search']('pain');
    releaseSlow([CROISSANT, { ...PAIN, sku: 'AUTRE' }]);
    await slow;
    expect(search['options']().map((o) => o.value)).toEqual(['PAIN-1']);
  });

  it('un échec se dit, sans résultat', async () => {
    const { search, fixture } = setup(async () => {
      throw new Error('réseau');
    });
    await search['search']('pain');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "La recherche n'a pas abouti",
    );
  });
});
