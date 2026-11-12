import { TestBed } from '@angular/core/testing';
import type {
  CatalogScreenItemView,
  CatalogScreenRowsView,
  CatalogScreenView,
  PublishedCellCounts,
  PublishedEntryView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { CatalogueScreenStore } from './catalogue-screen.store';
import { CatalogueService } from './catalogue.service';
import { MadeToOrderService } from './made-to-order.service';

/**
 * La copie de l'écran Catalogue (`plan-catalogue-du-back-office.md`, § 3.4) :
 * une lecture à la première ouverture, des lignes remplacées après un geste
 * avec des comptes recalculés, et le numéro retenu avec la copie.
 */

const NO_COUNTS: PublishedCellCounts = {
  inactif: 0,
  en_vente: 0,
  masque: 0,
  pas_vendu: 0,
  en_attente_validation: 0,
  incomplet: 0,
};

function item(sku: string, over: Partial<CatalogScreenItemView> = {}): CatalogScreenItemView {
  return {
    productId: `prd_${sku}`,
    sku,
    productSku: sku,
    name: sku,
    categoryId: 'fam',
    categoryName: 'Famille',
    pimPriceMillicents: 100_000,
    vatRatePercent: 5.5,
    publicTtcCents: 200,
    publicVatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    publicReviewPending: false,
    proReviewPending: false,
    audience: 'both',
    isFeaturedPro: false,
    isFeaturedPublic: false,
    isCustomRecipe: false,
    operationOnly: false,
    decidedAt: null,
    receivedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}

function entry(sku: string, proState: 'en_vente' | 'masque' = 'en_vente'): PublishedEntryView {
  return {
    productId: `prd_${sku}`,
    productSku: sku,
    name: sku,
    categoryId: 'fam',
    categoryPath: ['fam'],
    status: 'active',
    audience: 'both',
    audienceInherited: true,
    familyAudience: 'both',
    receivedAt: '2026-09-01T08:00:00.000Z',
    variants: [
      {
        sku,
        name: sku,
        onSale: true,
        isDefault: true,
        saleUnit: 'piece',
        gaps: [],
        reviewPending: { pro: false, public: false },
        pro: { state: proState, htMillicents: 100_000 },
        public: { state: 'en_vente', ttcCents: 200 },
      },
    ],
  };
}

function screenOf(version: number, items: readonly CatalogScreenItemView[]): CatalogScreenView {
  return {
    version,
    items,
    madeToOrder: [],
    published: {
      shelves: [
        {
          categoryId: 'fam',
          name: 'Famille',
          position: 0,
          withdrawn: false,
          pro: { ...NO_COUNTS, en_vente: items.length },
          public: { ...NO_COUNTS, en_vente: items.length },
        },
      ],
      entries: items.map((one) => entry(one.sku)),
      pendingReview: [],
    },
  };
}

class FakeCatalogue {
  screens = 0;
  screenAnswer = screenOf(1, [item('A', { proReviewPending: true }), item('B')]);
  rowsAnswer: CatalogScreenRowsView = { version: 2, entries: [], items: [] };
  screen(): Promise<CatalogScreenView> {
    this.screens += 1;
    return Promise.resolve(this.screenAnswer);
  }
  screenRows(): Promise<CatalogScreenRowsView> {
    return Promise.resolve(this.rowsAnswer);
  }
}

describe('CatalogueScreenStore', () => {
  let api: FakeCatalogue;
  let store: CatalogueScreenStore;

  beforeEach(() => {
    api = new FakeCatalogue();
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogueService, useValue: api },
        { provide: MadeToOrderService, useValue: { marks: () => Promise.resolve([]) } },
      ],
    });
    store = TestBed.inject(CatalogueScreenStore);
  });

  it('ne lit rien avant la première ouverture, puis une seule fois', async () => {
    expect(api.screens).toBe(0);
    expect(store.state()).toBe('idle');

    await store.open();
    await store.open();

    expect(api.screens).toBe(1);
    expect(store.state()).toBe('ready');
    expect(store.version()).toBe(1);
  });

  it('remplace la ligne relue et recalcule comptes par rayon et liste à valider', async () => {
    api.screenAnswer = {
      ...api.screenAnswer,
      published: {
        ...api.screenAnswer.published,
        pendingReview: [
          {
            sku: 'A',
            productId: 'prd_A',
            productSku: 'A',
            name: 'A',
            categoryId: 'fam',
            audiences: ['pro'],
            receivedAt: '2026-09-01T08:00:00.000Z',
          },
        ],
      },
    };
    await store.open();
    api.rowsAnswer = { version: 2, entries: [entry('A', 'masque')], items: [item('A')] };

    await store.refreshRows(['A']);

    const shelf = store.view().shelves[0];
    expect(shelf?.pro.en_vente).toBe(1);
    expect(shelf?.pro.masque).toBe(1);
    expect(store.view().pendingReview).toEqual([]);
    expect(store.items().map((one) => one.sku)).toEqual(['A', 'B']);
    // Le numéro des lignes peut couvrir le geste d'un collègue : la copie garde
    // le sien, et le veilleur relira l'écran entier.
    expect(store.version()).toBe(1);
  });

  it('retire de la copie un SKU demandé que la relecture ne rend plus', async () => {
    await store.open();
    api.rowsAnswer = { version: 2, entries: [entry('B')], items: [] };

    await store.refreshRows(['B']);

    expect(store.items().map((one) => one.sku)).toEqual(['A']);
  });

  it('relit en fond sans repasser par le chargement', async () => {
    await store.open();
    api.screenAnswer = screenOf(5, [item('C')]);

    const pending = store.refresh();
    expect(store.state()).toBe('ready');
    await pending;

    expect(store.version()).toBe(5);
    expect(store.items().map((one) => one.sku)).toEqual(['C']);
  });
});
