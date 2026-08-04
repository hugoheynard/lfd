import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { VisualsPanel } from './visuals-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('VisualsPanel', () => {
  it('ajoute un visuel via le store au clic', () => {
    const store = setup();
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const add = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((b) => b.textContent?.includes('Ajouter'));
    (add as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.media()).toHaveLength(1);
    expect(store.media()[0]?.role).toBe('hero');
  });

  it('retire un visuel', () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: '' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const remove = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((b) => b.textContent?.includes('Retirer'));
    (remove as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.media()).toHaveLength(0);
  });
});
