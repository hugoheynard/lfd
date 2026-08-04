import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ChannelsPanel } from './channels-panel';

describe('ChannelsPanel', () => {
  it('rend l’héritage par famille (mode + boutiques + TVA)', () => {
    const fixture = TestBed.createComponent(ChannelsPanel);
    fixture.componentRef.setInput('inheritance', {
      categoryName: 'Viennoiseries',
      emporter: { boutiques: ['Village', 'Ardroit'], tva: 'Réduit · 5,5 %' },
      surPlace: { boutiques: ['Village'], tva: 'Intermédiaire · 10 %' },
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Viennoiseries');
    expect(text).toContain('Réduit · 5,5 %');
    expect(text).toContain('Village · Ardroit');
  });

  it('invite à choisir une famille sans héritage', () => {
    const fixture = TestBed.createComponent(ChannelsPanel);
    fixture.componentRef.setInput('inheritance', null);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Choisissez une famille');
  });
});
