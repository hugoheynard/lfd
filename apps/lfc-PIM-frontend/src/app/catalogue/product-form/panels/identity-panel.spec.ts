import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { IdentityPanel } from './identity-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('IdentityPanel', () => {
  it('affiche un bouton d’enregistrement en mode édition', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer button',
    );
    expect(button?.textContent).toContain('Enregistrer');
  });

  it('pas de bouton d’enregistrement en création', () => {
    const store = setup();
    store.isEdit.set(false);
    const fixture = TestBed.createComponent(IdentityPanel);
    fixture.detectChanges();
    const footer = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer',
    );
    expect(footer).toBeNull();
  });
});
