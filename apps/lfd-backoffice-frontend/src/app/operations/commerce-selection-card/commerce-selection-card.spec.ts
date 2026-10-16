import { TestBed } from '@angular/core/testing';
import type { CatalogAdminItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { commerceOperation } from '../commerce-operation.testing';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommerceSelectionCard, selectableOf } from './commerce-selection-card';

type CatalogLine = Pick<CatalogAdminItemView, 'sku' | 'name' | 'categoryId' | 'operationOnly'>;

const BUCHE: CatalogLine = {
  sku: 'BUCHE-01',
  name: 'Bûche praliné',
  categoryId: 'patisserie',
  operationOnly: true,
};
const STOLLEN: CatalogLine = {
  sku: 'STOLLEN-01',
  name: 'Stollen',
  categoryId: 'viennoiserie',
  operationOnly: false,
};

async function setup(
  list: () => Promise<readonly CatalogLine[]>,
  setSelection: (key: string, skus: readonly string[]) => Promise<unknown> = async () => ({}),
) {
  const sent: (readonly string[])[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogueService, useValue: { list } },
      {
        provide: CommerceOperationsService,
        useValue: {
          setSelection: (key: string, skus: readonly string[]) => {
            sent.push(skus);
            return setSelection(key, skus);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommerceSelectionCard);
  fixture.componentRef.setInput(
    'operation',
    commerceOperation({ skus: ['BUCHE-01', 'GONE-01'], sellingSkus: ['BUCHE-01'] }),
  );
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, card: fixture.componentInstance, sent };
}

describe('selectableOf', () => {
  it('une ligne par article du commerce, sa famille comme rayon', () => {
    expect(selectableOf([STOLLEN])).toEqual([
      { sku: 'STOLLEN-01', name: 'Stollen', shelf: 'viennoiserie' },
    ]);
  });
});

describe('CommerceSelectionCard', () => {
  it('nomme chaque article par le catalogue du commerce, et dit ce qui n’est pas en vente', async () => {
    const { card } = await setup(async () => [BUCHE, STOLLEN]);
    expect(card['rows']()).toEqual([
      { sku: 'BUCHE-01', name: 'Bûche praliné', operationOnly: true, notSelling: false },
      { sku: 'GONE-01', name: null, operationOnly: false, notSelling: true },
    ]);
  });

  it('un ajout pas encore enregistré ne se dit pas « Pas en vente »', async () => {
    const { card } = await setup(async () => [BUCHE, STOLLEN]);
    card['add']('STOLLEN-01');
    expect(card['rows']()[2]).toMatchObject({ sku: 'STOLLEN-01', notSelling: false });
  });

  it('réécrit la sélection entière, dans l’ordre du rayon', async () => {
    const { card, sent } = await setup(async () => [BUCHE, STOLLEN]);
    card['add']('STOLLEN-01');
    card['move'](2, -1);
    card['remove']('GONE-01');
    expect(card['changed']()).toBe(true);
    await card['save']();
    expect(sent).toEqual([['BUCHE-01', 'STOLLEN-01']]);
  });

  it('un catalogue illisible se dit, et ferme l’ajout', async () => {
    const { fixture } = await setup(async () => {
      throw new Error('403');
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain("Le catalogue du commerce n'a pas pu être lu");
    expect(root.querySelector('app-storefront-product-picker')).toBeNull();
  });

  it('dit le refus du serveur tel quel', async () => {
    const { card } = await setup(
      async () => [BUCHE],
      async () => {
        throw { status: 400, error: { code: 'operations.sku_unknown', message: 'GONE-01 ?' } };
      },
    );
    await card['save']();
    expect(card['refusal']()).toBe('GONE-01 ?');
  });
});
