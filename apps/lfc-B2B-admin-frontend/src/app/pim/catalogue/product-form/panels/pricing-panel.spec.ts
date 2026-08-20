import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { PricingPanel } from './pricing-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('PricingPanel', () => {
  it('affiche le bouton save en édition, pas en création', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.section-footer')).not.toBeNull();

    store.isEdit.set(false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.section-footer')).toBeNull();
  });
});
