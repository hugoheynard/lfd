import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { CatalogProduct } from '../storefront-catalog';
import { StorefrontProductPicker } from './storefront-product-picker';

/**
 * Le choix d'un article : la recherche filtre, l'article déjà désigné reste
 * dans la liste, et l'on ne rend QUE le SKU du produit.
 */
const PRODUCTS: readonly CatalogProduct[] = [
  { sku: 'CRO', name: 'Croissant', shelf: 'vien' },
  { sku: 'ECL', name: 'Éclair café', shelf: 'pastry' },
  { sku: 'BAG', name: 'Baguette', shelf: 'bread' },
];

function setup(sku: string | null = null) {
  const fixture = TestBed.createComponent(StorefrontProductPicker);
  fixture.componentRef.setInput('products', PRODUCTS);
  fixture.componentRef.setInput('sku', sku);
  fixture.detectChanges();
  const picker = fixture.componentInstance;
  const picked: string[] = [];
  picker.picked.subscribe((value) => picked.push(value));
  return { fixture, picker, picked };
}

describe('StorefrontProductPicker', () => {
  it('liste tout, nom et SKU, tant qu’on ne cherche rien', () => {
    const { picker } = setup();
    expect(picker['options']().map((o) => o.label)).toEqual([
      'Croissant · CRO',
      'Éclair café · ECL',
      'Baguette · BAG',
    ]);
  });

  it('la recherche filtre, sans perdre l’article déjà désigné', () => {
    const { picker } = setup('BAG');
    picker['query'].set('eclair');
    expect(picker['options']().map((o) => o.value)).toEqual(['BAG', 'ECL']);
    expect(picker['hint']()).toBe('1 article en vente.');
  });

  it('rien ne correspond : il le dit', () => {
    const { picker } = setup();
    picker['query'].set('zzz');
    expect(picker['hint']()).toBe('Aucun article en vente ne correspond.');
  });

  it('rend le seul SKU choisi', () => {
    const { picker, picked } = setup();
    picker.picked.emit('ECL');
    expect(picked).toEqual(['ECL']);
  });
});
