import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientPreferences } from '../../../client-preferences.service';
import { FR } from '../../../copy/fr';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { PreferencesPanel } from '../preferences-panel/preferences-panel';
import { PreferencesDeskCard } from './preferences-desk-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

/** Une société qui a posé son habitude : retrait, au point par défaut, en signant. */
const WITH_HABIT: CompanyView = {
  ...TOMMEUSES,
  fulfillmentPreference: {
    method: 'pickup',
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: true,
  },
};

const render = (company: CompanyView): HTMLElement =>
  bootCard(
    PreferencesDeskCard,
    [company],
    [
      {
        provide: ClientPreferences,
        useValue: { habit: signal('Retrait au Labo'), language: signal('Français') },
      },
    ],
  ).nativeElement as HTMLElement;

describe('PreferencesDeskCard', () => {
  it('lit l’habitude et la langue, et la règle dessous', () => {
    const el = render(TOMMEUSES);

    expect(el.querySelector('.habit')?.textContent).toContain('Retrait au Labo');
    expect(el.querySelector('.language')?.textContent).toContain('Français');
    expect(el.textContent).toContain(FR.account.prefNote);
  });

  /**
   * Régression : les deux « Modifier » en ligne n'avaient aucune action
   * (relevé le 2026-09-14). Chacun ouvre désormais le panneau.
   */
  it('au gestionnaire, les deux « Modifier » ouvrent le panneau Préférences sur la société', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const expected = {
      companyId: 'cmp_1',
      canManage: true,
      preference: WITH_HABIT.fulfillmentPreference,
    };

    for (const selector of ['.habit button', '.language button']) {
      const el = render(WITH_HABIT);
      const button = el.querySelector<HTMLButtonElement>(selector);
      expect(button?.textContent?.trim()).toBe(FR.account.edit);
      button?.click();

      expect(openedPanel()?.component).toBe(PreferencesPanel);
      expect(openedPanel()?.side).toBe('right');
      expect(openedPanel()?.data).toEqual(expected);
      TestBed.inject(FoldPanelHostService).dismissAll();
    }
  });

  /** L'API refuse l'habitude aux autres rôles ; la langue, elle, ne touche pas la société. */
  it('aux autres rôles, pas de « Modifier » sur l’habitude, mais la langue reste réglable', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    for (const role of ['orders', 'billing'] as const) {
      const el = render(asRole(role));
      expect(el.querySelector('.habit button')).toBeNull();

      el.querySelector<HTMLButtonElement>('.language button')?.click();
      expect(openedPanel()?.data).toMatchObject({ companyId: 'cmp_1', canManage: false });
      TestBed.inject(FoldPanelHostService).dismissAll();
    }
  });
});
