import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import { bootCard, footButton, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { DataPanel } from '../data-panel/data-panel';
import { DataMobileCard } from './data-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('DataMobileCard', () => {
  it('une ligne, et le panneau porte le reste', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = bootCard(DataMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;

    expect(el.textContent).toContain(FR.account.dataSummary);
    expect(el.textContent).not.toContain(FR.account.closeBody);
    footButton(el).click();
    expect(openedPanel()?.component).toBe(DataPanel);
  });
});
