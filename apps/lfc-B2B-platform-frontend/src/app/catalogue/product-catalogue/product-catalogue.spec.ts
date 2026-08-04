import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProductCatalogue } from './product-catalogue';

describe('ProductCatalogue (orchestrator)', () => {
  function make(): ProductCatalogue {
    const fixture = TestBed.createComponent(ProductCatalogue);
    fixture.componentRef.setInput('products', []);
    fixture.componentRef.setInput('categories', []);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('defaults to the cards view', () => {
    expect(make().view()).toBe('cards');
  });

  it('switches the view and narrows an unknown value to cards', () => {
    const cat = make();
    cat.setView('table');
    expect(cat.view()).toBe('table');
    cat.setView('cards');
    expect(cat.view()).toBe('cards');
    // A bogus value from the toggle is narrowed defensively.
    cat.setView('bogus');
    expect(cat.view()).toBe('cards');
  });
});
