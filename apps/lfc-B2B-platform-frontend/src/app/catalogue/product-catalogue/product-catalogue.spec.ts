import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { toCatalogueView } from '../catalogue-view';
import { ProductCatalogue } from './product-catalogue';

describe('ProductCatalogue (orchestrator)', () => {
  function make(view?: string): ProductCatalogue {
    const fixture = TestBed.createComponent(ProductCatalogue);
    fixture.componentRef.setInput('products', []);
    fixture.componentRef.setInput('categories', []);
    if (view !== undefined) {
      fixture.componentRef.setInput('view', view);
    }
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('defaults to the cards view', () => {
    expect(make().view()).toBe('cards');
  });

  it('reflects the controlled view input (the page owns the state)', () => {
    expect(make('shelves').view()).toBe('shelves');
    expect(make('list').view()).toBe('list');
  });
});

describe('toCatalogueView', () => {
  it('narrows known values and defaults an unknown one to cards', () => {
    expect(toCatalogueView('cards')).toBe('cards');
    expect(toCatalogueView('shelves')).toBe('shelves');
    expect(toCatalogueView('list')).toBe('list');
    expect(toCatalogueView('bogus')).toBe('cards');
  });
});
