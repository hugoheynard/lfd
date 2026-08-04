import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { IdentityPanel } from './identity-panel';

describe('IdentityPanel', () => {
  function mount() {
    const fixture = TestBed.createComponent(IdentityPanel);
    const ref = fixture.componentRef;
    ref.setInput('name', 'Café');
    ref.setInput('kind', 'resale');
    ref.setInput('categoryId', 'cat_vien');
    ref.setInput('sku', 'CAFE');
    ref.setInput('kinds', [{ value: 'resale', label: 'Revente' }]);
    ref.setInput('categories', []);
    fixture.detectChanges();
    return fixture;
  }

  it('crée le panneau et reflète les models', () => {
    const fixture = mount();
    expect(fixture.componentInstance.name()).toBe('Café');
    expect(fixture.componentInstance.kind()).toBe('resale');
  });

  it('rend un bouton d’enregistrement quand saveable', () => {
    const fixture = mount();
    fixture.componentRef.setInput('saveable', true);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer button',
    );
    expect(button?.textContent).toContain('Enregistrer');
  });
});
