import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { ChannelsPanel } from './channels-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('ChannelsPanel', () => {
  it('invite à choisir une famille sans héritage', () => {
    setup();
    const fixture = TestBed.createComponent(ChannelsPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Choisissez une famille');
  });

  it('rend l’héritage par famille quand une catégorie est choisie', () => {
    const store = setup();
    store.regimes.set([
      {
        id: 'tva_55',
        name: 'Réduit',
        description: '',
        percent: 5.5,
        tag: 'tva-5-5',
        usage: { emporter: 0, surPlace: 0 },
      },
    ]);
    store.categories.set([
      {
        id: 'cat_vien',
        name: { fr: 'Viennoiseries' },
        slug: { fr: 'viennoiseries' },
        parentId: null,
        position: 1,
        isArchived: false,
        channelPreset: {
          b1: { emporter: true, surPlace: false },
          b2: { emporter: true, surPlace: false },
        },
        emporterTvaId: 'tva_55',
        surPlaceTvaId: 'tva_55',
      },
    ]);
    store.categoryId.set('cat_vien');
    const fixture = TestBed.createComponent(ChannelsPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Viennoiseries');
    expect(text).toContain('Réduit');
  });
});
