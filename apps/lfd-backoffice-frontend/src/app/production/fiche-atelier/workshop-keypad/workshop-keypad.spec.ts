import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { type KeypadData, WorkshopKeypad } from './workshop-keypad';

/**
 * Le pavé : prérempli du manque du palier, la première touche REMPLACE la
 * valeur préremplie, les raccourcis posent une valeur, et seul « Déclarer »
 * ferme sur une quantité — jamais zéro.
 */

const DATA: KeypadData = {
  productName: 'Croissant au beurre',
  preset: 60,
  remaining: 60,
  container: { unitsPerContainer: 30, singular: 'plaque' },
  shortcuts: [
    { id: 'bs-1', label: '1 chariot', pieces: 96 },
    { id: 'bs-2', label: 'demi-plaque', pieces: 30 },
  ],
};

let closed: (number | undefined)[];

beforeEach(() => {
  closed = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (value?: number): void => void closed.push(value) },
      },
    ],
  });
});

function render(data: KeypadData = DATA): HTMLElement {
  const fixture = TestBed.createComponent(WorkshopKeypad);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  el.addEventListener('click', () => fixture.detectChanges());
  return el;
}

const shown = (el: HTMLElement): string =>
  el.querySelector('[data-keypad-value]')?.textContent?.trim() ?? '';
const digit = (el: HTMLElement, value: string): void =>
  el.querySelector<HTMLButtonElement>(`[data-keypad-digit="${value}"]`)?.click();
const declare = (el: HTMLElement): HTMLButtonElement | undefined =>
  [...el.querySelectorAll('button')].find((node) => node.textContent?.includes('Déclarer'));

describe('le pavé du fournil', () => {
  it('s’ouvre prérempli, et dit ce qui restera', () => {
    const el = render();

    expect(shown(el)).toBe('60');
    expect(el.textContent).toContain('la ligne sera complète');
    expect(declare(el)?.textContent?.trim()).toBe('Déclarer 60 pièces');
  });

  it('la première touche remplace la valeur préremplie', () => {
    const el = render();

    digit(el, '2');
    digit(el, '4');

    expect(shown(el)).toBe('24');
    expect(el.textContent).toContain('il restera 36');
  });

  it('propose « le reste », 1 et 2 plaques, puis les raccourcis — sans doublon', () => {
    const el = render();

    expect(
      [...el.querySelectorAll('[data-keypad-preset]')].map((node) => node.textContent?.trim()),
    ).toEqual(['Le reste · 60', '1 plaque · 30', '1 chariot · 96']);
  });

  it('un raccourci POSE sa valeur, il n’enregistre rien', () => {
    const el = render();

    el.querySelector<HTMLButtonElement>('[data-keypad-preset="bs-1"]')?.click();

    expect(shown(el)).toBe('96');
    expect(closed).toEqual([]);
  });

  it('« Déclarer » ferme sur la quantité', () => {
    const el = render();

    declare(el)?.click();

    expect(closed).toEqual([60]);
  });

  it('refuse zéro', () => {
    const el = render();

    [...el.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'C')?.click();

    expect(declare(el)?.disabled).toBe(true);
    declare(el)?.click();
    expect(closed).toEqual([]);
  });
});
