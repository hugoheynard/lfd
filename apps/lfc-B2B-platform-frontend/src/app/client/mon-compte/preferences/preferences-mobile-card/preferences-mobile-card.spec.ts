import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientPreferences } from '../../../client-preferences.service';
import { FR } from '../../../copy/fr';
import { bootCard, footButton, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { PreferencesPanel } from '../preferences-panel/preferences-panel';
import { PreferencesMobileCard } from './preferences-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('PreferencesMobileCard', () => {
  it('garde l’habitude et la langue, la règle part au panneau', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = bootCard(
      PreferencesMobileCard,
      [TOMMEUSES],
      [
        {
          provide: ClientPreferences,
          useValue: { habit: signal('Retrait au Labo'), language: signal('Français') },
        },
      ],
    ).nativeElement as HTMLElement;

    expect(el.textContent).toContain('Retrait au Labo');
    expect(el.textContent).toContain('Français');
    expect(el.textContent).not.toContain(FR.account.prefNote);
    footButton(el).click();
    expect(openedPanel()?.component).toBe(PreferencesPanel);
  });
});
