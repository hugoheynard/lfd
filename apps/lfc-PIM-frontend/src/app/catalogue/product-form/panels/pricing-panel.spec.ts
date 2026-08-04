import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PricingPanel } from './pricing-panel';

describe('PricingPanel', () => {
  it('crée le panneau et reflète prix + poids', () => {
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.componentRef.setInput('priceEur', 4.5);
    fixture.componentRef.setInput('weightGrams', 250);
    fixture.detectChanges();
    expect(fixture.componentInstance.priceEur()).toBe(4.5);
    expect(fixture.componentInstance.weightGrams()).toBe(250);
  });

  it('n’affiche pas de bouton save hors mode saveable', () => {
    const fixture = TestBed.createComponent(PricingPanel);
    fixture.componentRef.setInput('priceEur', null);
    fixture.componentRef.setInput('weightGrams', null);
    fixture.detectChanges();
    const footer = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer',
    );
    expect(footer).toBeNull();
  });
});
