import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ProductHttpApi } from '../../catalogue/product-http-api';
import { EMPTY_NUTRITION, type Product, type Variant } from '../../data/models';
import { operationView } from '../operation-view.testing';
import { OperationsService } from '../operations.service';
import { SelectionCard, selectableOf } from './selection-card';

function variant(sku: string, name: string): Variant {
  return {
    id: sku,
    sku,
    name: { fr: name },
    isDefault: false,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergens: null,
    mayContain: [],
    nutrition: EMPTY_NUTRITION,
  };
}

function product(name: string, variants: readonly Variant[]): Product {
  return {
    id: name,
    sku: name,
    name: { fr: name },
    kind: 'daily',
    categoryId: 'patisserie',
    status: 'published',
    variants: [...variants],
    channelsOverride: null,
    vatByContext: {},
  };
}

const CATALOGUE: readonly Product[] = [
  product('Bûche', [variant('BUCHE-4', '4 parts'), variant('BUCHE-8', '8 parts')]),
  product('Galette', [variant('GALETTE-1', 'Unique')]),
];

function setup(
  skus: readonly string[],
  list: () => Promise<readonly Product[]> = async () => CATALOGUE,
  locked = false,
) {
  const sent: (readonly string[])[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductHttpApi, useValue: { list } },
      {
        provide: OperationsService,
        useValue: {
          setSelection: async (_key: string, next: readonly string[]) => {
            sent.push(next);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SelectionCard);
  fixture.componentRef.setInput('operation', operationView({ skus }));
  fixture.componentRef.setInput('locked', locked);
  fixture.detectChanges();
  return { fixture, card: fixture.componentInstance, sent };
}

describe('selectableOf', () => {
  it('une ligne par déclinaison, nommée par elle seulement s’il y en a plusieurs', () => {
    expect(selectableOf(CATALOGUE).map((item) => [item.sku, item.name])).toEqual([
      ['BUCHE-4', 'Bûche — 4 parts'],
      ['BUCHE-8', 'Bûche — 8 parts'],
      ['GALETTE-1', 'Galette'],
    ]);
  });
});

describe('SelectionCard', () => {
  it('dit que la sélection ne restreint pas encore la vente (lot 1)', () => {
    const { fixture } = setup([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'La sélection ne restreint pas encore la vente : un article publié reste en vente dans son rayon.',
    );
  });

  it('nomme les articles par le catalogue, et signale une référence inconnue', async () => {
    const { card } = setup(['GALETTE-1', 'DISPARU-1']);
    await vi.waitFor(() => expect(card['catalogue']()).toHaveLength(3));
    expect(card['rows']()).toEqual([
      { sku: 'GALETTE-1', name: 'Galette' },
      { sku: 'DISPARU-1', name: null },
    ]);
  });

  it('ajoute, monte, retire, puis envoie la liste entière dans l’ordre', async () => {
    const { card, sent } = setup(['GALETTE-1']);
    card['add']('BUCHE-8');
    card['add']('BUCHE-8');
    card['move'](1, -1);
    card['add']('BUCHE-4');
    card['remove']('GALETTE-1');
    expect(card['changed']()).toBe(true);
    await card['save']();
    expect(sent).toEqual([['BUCHE-8', 'BUCHE-4']]);
  });

  it('remettre l’ordre d’origine n’est plus une modification', () => {
    const { card } = setup(['GALETTE-1', 'BUCHE-4']);
    card['move'](0, 1);
    card['move'](0, 1);
    expect(card['changed']()).toBe(false);
  });

  it('un catalogue illisible se dit, la sélection reste à l’écran', async () => {
    const { card, fixture } = setup(['GALETTE-1'], async () => {
      throw new Error('réseau');
    });
    await vi.waitFor(() => expect(card['catalogueFailed']()).toBe(true));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain("Le catalogue n'a pas pu être lu");
    expect(root.textContent).toContain('GALETTE-1');
    expect(root.querySelector('app-storefront-product-picker')).toBeNull();
  });
});
