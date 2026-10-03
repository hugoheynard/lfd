import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { RowTab } from '../delivery-loading-tiles';
import { LoadingRowPicker } from './loading-row-picker';

const TABS: readonly RowTab[] = [
  {
    row: 1,
    label: 'R1 · Fond',
    progress: '4/5',
    done: false,
    marks: [
      { key: 'a', state: 'loaded', hue: 0 },
      { key: 'b', state: 'next', hue: 2 },
    ],
  },
  {
    row: 2,
    label: 'R2 · Portes',
    progress: '✓',
    done: true,
    marks: [{ key: 'c', state: 'loaded', hue: 4 }],
  },
];

describe('LoadingRowPicker', () => {
  it('rend un onglet par rangée, l’ouvert sélectionné, et dit l’onglet touché', () => {
    const fixture = TestBed.createComponent(LoadingRowPicker);
    fixture.componentRef.setInput('tabs', TABS);
    fixture.componentRef.setInput('selected', 1);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const selected: number[] = [];
    fixture.componentInstance.selectedChange.subscribe((row) => selected.push(row));

    expect(element.querySelector('[role="tablist"]')).not.toBeNull();
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[data-row-tab]')];
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs[1]?.getAttribute('aria-label')).toBe('R2 · Portes — chargée');
    expect(tabs[0]?.querySelectorAll('.rp-mark--next')).toHaveLength(1);

    tabs[1]?.click();
    expect(selected).toEqual([2]);
  });

  it('teinte chaque carré à la couleur de son arrêt, comme la vue de rangée', () => {
    const fixture = TestBed.createComponent(LoadingRowPicker);
    fixture.componentRef.setInput('tabs', TABS);
    fixture.componentRef.setInput('selected', 1);
    fixture.detectChanges();

    const marks = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.rp-mark')];
    expect(marks.map((mark) => mark.classList.contains('hue-a-0'))).toEqual([true, false, false]);
    expect(marks[1]?.classList.contains('hue-a-2')).toBe(true);
    expect(marks[2]?.classList.contains('hue-a-4')).toBe(true);
  });
});
