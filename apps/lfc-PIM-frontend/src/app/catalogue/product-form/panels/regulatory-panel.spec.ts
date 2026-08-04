import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { RegulatoryPanel } from './regulatory-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('RegulatoryPanel', () => {
  it('rend les valeurs nutritionnelles et le sélecteur allergènes', () => {
    setup();
    const fixture = TestBed.createComponent(RegulatoryPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Calories (kcal)');
    expect(text).toContain('Aucun allergène');
  });

  it('bouton save présent en édition', () => {
    const store = setup();
    store.isEdit.set(true);
    const fixture = TestBed.createComponent(RegulatoryPanel);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer button',
    );
    expect(button?.textContent).toContain('Enregistrer');
  });
});
