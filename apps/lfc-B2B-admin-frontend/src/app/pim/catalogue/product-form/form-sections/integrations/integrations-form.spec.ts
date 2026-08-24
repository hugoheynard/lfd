import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { IntegrationsForm } from './integrations-form';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({ providers: [ProductFormStore, provideHttpClient()] });
  return TestBed.inject(ProductFormStore);
}

describe('IntegrationsForm', () => {
  it('pose les deux canaux côte à côte, sans niveau de navigation', () => {
    // Deux états vides derrière trois niveaux d'onglets ne se justifient pas :
    // le rail du PIM, la page, puis des sous-onglets pour deux blocs.
    setup();
    const fixture = TestBed.createComponent(IntegrationsForm);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.channel').length).toBe(2);
    expect(root.querySelector('fold-tabs')).toBeNull();
    expect(root.querySelector('fold-nav-layout')).toBeNull();
  });

  it('héberge le HANDLE, parce que c’est une propriété du canal', () => {
    // Une URL de boutique en ligne appartient à Shopify, pas à l'identité du
    // produit : le B2B ne s'en sert pas, et le référencement n'est pas une
    // caractéristique de la chose vendue.
    setup();
    const fixture = TestBed.createComponent(IntegrationsForm);
    fixture.detectChanges();
    const field = (fixture.nativeElement as HTMLElement).querySelector('fold-field');
    expect(field?.getAttribute('label')).toBe('Handle');
  });

  it('dit que le handle manque plutôt que d’en inventer un', () => {
    setup();
    const fixture = TestBed.createComponent(IntegrationsForm);
    fixture.detectChanges();
    const field = (fixture.nativeElement as HTMLElement).querySelector('fold-field');
    expect(field?.textContent).toContain('attribué à la première poussée');
  });
});
