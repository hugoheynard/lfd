import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { CommunicationForm } from './communication-form';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('CommunicationForm', () => {
  it('rend les champs éditoriaux', () => {
    setup();
    const fixture = TestBed.createComponent(CommunicationForm);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Description longue');
    expect(text).toContain('Récit / savoir-faire');
  });

  it('reflète l’éditorial du store', () => {
    const store = setup();
    store.editorial.update((e) => ({ ...e, descriptionLong: { fr: 'Torréfaction' } }));
    const fixture = TestBed.createComponent(CommunicationForm);
    fixture.detectChanges();
    const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea');
    expect(textarea?.value).toBe('Torréfaction');
  });
});
