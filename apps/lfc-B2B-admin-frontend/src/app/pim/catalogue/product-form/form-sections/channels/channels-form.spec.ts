import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import { ChannelsForm } from './channels-form';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient(), provideTestSalesContexts()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('ChannelsForm', () => {
  it('invite à choisir une famille sans héritage', () => {
    setup();
    const fixture = TestBed.createComponent(ChannelsForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Choisissez une famille');
  });

  it('rend l’héritage par famille quand une catégorie est choisie', () => {
    const store = setup();
    store.rates.set([
      {
        id: 'tva_55',
        name: 'Réduit',
        description: '',
        percent: 5.5,
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
        channelPreset: [
          { locationId: 'emp_village', context: 'emporter' },
          { locationId: 'emp_val', context: 'emporter' },
        ],
        vatByContext: { emporter: 'tva_55', surPlace: 'tva_55' },
        activeProductCount: 0,
      },
    ]);
    store.categoryId.set('cat_vien');
    const fixture = TestBed.createComponent(ChannelsForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Viennoiseries');
    expect(text).toContain('Réduit');
  });
});
