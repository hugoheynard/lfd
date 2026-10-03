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
      { key: 'a', state: 'loaded' },
      { key: 'b', state: 'next' },
    ],
  },
  {
    row: 2,
    label: 'R2 · Portes',
    progress: '✓',
    done: true,
    marks: [{ key: 'c', state: 'loaded' }],
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
});
