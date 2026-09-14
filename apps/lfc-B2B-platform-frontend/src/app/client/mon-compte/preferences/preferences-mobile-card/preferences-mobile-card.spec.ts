import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type CompanyView, NO_FULFILLMENT_PREFERENCE } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientPreferences } from '../../../client-preferences.service';
import { FR } from '../../../copy/fr';
import {
  asRole,
  bootCard,
  footButton,
  matchMediaAt,
  openedPanel,
  TOMMEUSES,
} from '../../account.fixture';
import { PreferencesPanel } from '../preferences-panel/preferences-panel';
import { PreferencesMobileCard } from './preferences-mobile-card';

// Le panneau lit la largeur AU CLIC : chaque ouverture en a besoin.
beforeEach(() => {
  vi.stubGlobal('matchMedia', matchMediaAt(true));
});

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

const render = (companies: readonly CompanyView[]): HTMLElement =>
  bootCard(PreferencesMobileCard, companies, [
    {
      provide: ClientPreferences,
      useValue: { habit: signal('Retrait au Labo'), language: signal('Français') },
    },
  ]).nativeElement as HTMLElement;

describe('PreferencesMobileCard', () => {
  it('garde l’habitude et la langue, la règle part au panneau', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = render([TOMMEUSES]);

    expect(el.textContent).toContain('Retrait au Labo');
    expect(el.textContent).toContain('Français');
    expect(el.textContent).not.toContain(FR.account.prefNote);
    footButton(el).click();
    expect(openedPanel()?.component).toBe(PreferencesPanel);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toEqual({
      companyId: 'cmp_1',
      canManage: true,
      preference: TOMMEUSES.fulfillmentPreference,
    });
  });

  it('un rôle qui n’écrit pas ouvre le même panneau, en lecture', () => {
    footButton(render([asRole('billing')])).click();

    expect(openedPanel()?.data).toMatchObject({ companyId: 'cmp_1', canManage: false });
  });

  /** La langue ne dépend pas d'une société : le panneau s'ouvre pour elle seule. */
  it('sans société, ouvre le panneau quand même, sans rien à écrire', () => {
    footButton(render([])).click();

    expect(openedPanel()?.data).toEqual({
      companyId: null,
      canManage: false,
      preference: NO_FULFILLMENT_PREFERENCE,
    });
  });
});
