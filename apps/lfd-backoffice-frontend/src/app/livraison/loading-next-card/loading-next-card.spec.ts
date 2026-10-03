import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { NextBin } from '../delivery-loading-rows';
import { LoadingNextCard } from './loading-next-card';

const NEXT: NextBin = {
  key: 'b-1:whole',
  bin: {
    binId: 'b-1',
    code: 'H4N9QC',
    reference: 'CMD-2055',
    binTypeName: 'Bac M',
    half: null,
    sharedWithReference: null,
    isotherm: false,
    stackIndex: 1,
  },
  stopPosition: 5,
  customerLabel: 'Café de la Gare',
};

function render(canLoad: boolean) {
  const fixture = TestBed.createComponent(LoadingNextCard);
  fixture.componentRef.setInput('next', NEXT);
  fixture.componentRef.setInput('placement', {
    lead: 'Rangée 1 (le fond) · pile 1',
    detail: 'à gauche, sur le bac de l’arrêt 6',
  });
  fixture.componentRef.setInput('canLoad', canLoad);
  fixture.detectChanges();
  return fixture;
}

describe('LoadingNextCard', () => {
  it('montre le bac, son arrêt écrit, son client et la consigne', () => {
    const element = render(false).nativeElement as HTMLElement;
    expect(element.querySelector('[data-next-stop]')?.textContent?.trim()).toBe('5');
    expect(element.querySelector('[data-next-code]')?.textContent?.trim()).toBe('H4N9QC');
    expect(element.textContent).toContain('Café de la Gare · CMD-2055');
    expect(element.querySelector('[data-next-placement]')?.textContent).toContain(
      'à gauche, sur le bac de l’arrêt 6',
    );
    expect(element.querySelector('[data-scan]')).toBeNull();
  });

  it('met un code tapé en majuscules et le rend à l’écran', () => {
    const fixture = render(true);
    const element = fixture.nativeElement as HTMLElement;
    const submitted: string[] = [];
    fixture.componentInstance.submitted.subscribe((code) => submitted.push(code));
    const input = element.querySelector<HTMLInputElement>('[data-typed-code] input');
    if (input === null) {
      throw new Error('champ absent');
    }
    input.value = 'l5r2de';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-load-typed]')?.click();
    expect(submitted).toEqual(['L5R2DE']);
  });
});
