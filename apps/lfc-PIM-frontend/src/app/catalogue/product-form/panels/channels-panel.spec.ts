import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ChannelsPanel } from './channels-panel';

describe('ChannelsPanel', () => {
  it('affiche la TVA héritée quand fournie', () => {
    const fixture = TestBed.createComponent(ChannelsPanel);
    fixture.componentRef.setInput('tva', {
      emporter: 'Réduit · 5,5 %',
      surPlace: 'Intermédiaire · 10 %',
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Réduit · 5,5 %');
    expect(text).toContain('Intermédiaire · 10 %');
  });

  it('invite à choisir une famille sans TVA', () => {
    const fixture = TestBed.createComponent(ChannelsPanel);
    fixture.componentRef.setInput('tva', null);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Choisissez une famille');
  });
});
