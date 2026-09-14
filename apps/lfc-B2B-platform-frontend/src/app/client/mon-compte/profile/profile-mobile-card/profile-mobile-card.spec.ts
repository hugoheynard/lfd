import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import {
  accountWith,
  asRole,
  bootCard,
  footButton,
  matchMediaAt,
  openedPanel,
  PROFILE,
  TOMMEUSES,
} from '../../account.fixture';
import { ProfilePanel } from '../profile-panel/profile-panel';
import { ProfileMobileCard } from './profile-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('ProfileMobileCard', () => {
  it('garde le nom et l’adresse — le téléphone et la phrase vont au panneau', () => {
    const el = bootCard(ProfileMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;

    const facts = el.querySelector('.facts')?.textContent ?? '';
    expect(facts).toContain('Hugo Heynard');
    expect(facts).toContain('hheynard@gmail.com');
    expect(el.textContent).not.toContain('06 12 44 08 71');
    expect(el.textContent).not.toContain(FR.account.profileNote);
  });

  it('retombe sur un tiret quand le profil n’a pas de nom', () => {
    const el = bootCard(
      ProfileMobileCard,
      [TOMMEUSES],
      [accountWith([TOMMEUSES], { ...PROFILE, firstName: '', lastName: '' })],
    ).nativeElement as HTMLElement;

    expect(el.querySelector('.facts')?.textContent).toContain(FR.account.identityUnknown);
  });

  it('« Modifier » pour tous les rôles, en feuille du bas', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));

    for (const role of ['owner', 'admin', 'orders', 'billing'] as const) {
      const el = bootCard(ProfileMobileCard, [asRole(role)]).nativeElement as HTMLElement;
      expect(footButton(el).textContent).toContain(FR.account.edit);
      footButton(el).click();

      expect(openedPanel()?.component).toBe(ProfilePanel);
      expect(openedPanel()?.side).toBe('bottom');
      TestBed.inject(FoldPanelHostService).dismissAll();
    }
  });

  it('sans profil lu, pas de bouton qui ouvrirait un panneau vide', () => {
    const el = bootCard(ProfileMobileCard, [TOMMEUSES], [accountWith([TOMMEUSES], null)])
      .nativeElement as HTMLElement;

    expect(el.querySelector('app-card-foot')).toBeNull();
  });
});
