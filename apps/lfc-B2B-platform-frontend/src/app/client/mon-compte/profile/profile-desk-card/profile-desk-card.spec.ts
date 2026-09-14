import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import {
  accountWith,
  asRole,
  bootCard,
  matchMediaAt,
  openedPanel,
  PROFILE,
  TOMMEUSES,
} from '../../account.fixture';
import { ProfilePanel } from '../profile-panel/profile-panel';
import { ProfileDeskCard } from './profile-desk-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('ProfileDeskCard', () => {
  it('porte les quatre coordonnées de la personne et la phrase qui les distingue de la société', () => {
    const el = bootCard(ProfileDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;

    const facts = el.querySelector('.facts')?.textContent ?? '';
    for (const value of ['Hugo', 'Heynard', 'hheynard@gmail.com', '06 12 44 08 71']) {
      expect(facts).toContain(value);
    }
    expect(el.textContent).toContain(FR.account.profileNote);
    expect(el.querySelectorAll('input').length).toBe(0);
  });

  it('dit un téléphone absent plutôt que de laisser un vide', () => {
    const el = bootCard(
      ProfileDeskCard,
      [TOMMEUSES],
      [accountWith([TOMMEUSES], { ...PROFILE, phone: '' })],
    ).nativeElement as HTMLElement;

    expect(el.querySelector('.facts .num')?.textContent).toContain(FR.account.noPhone);
  });

  /** C'est SON profil : le rôle dans la société n'y change rien. */
  it('offre « Modifier » à tous les rôles, et ouvre le panneau du profil', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));

    for (const role of ['owner', 'admin', 'orders', 'billing'] as const) {
      TestBed.resetTestingModule();
      const el = bootCard(ProfileDeskCard, [asRole(role)]).nativeElement as HTMLElement;
      const edit = el.querySelector<HTMLButtonElement>('button[foldButton]');
      expect(edit?.textContent).toContain(FR.account.edit);
      edit?.click();

      expect(openedPanel()?.component).toBe(ProfilePanel);
      expect(openedPanel()?.side).toBe('right');
      expect(openedPanel()?.data).toEqual({
        firstName: 'Hugo',
        lastName: 'Heynard',
        email: 'hheynard@gmail.com',
        phone: '06 12 44 08 71',
      });
      TestBed.inject(FoldPanelHostService).dismissAll();
    }
  });

  it('sans profil lu, ni coordonnées ni « Modifier »', () => {
    const el = bootCard(ProfileDeskCard, [TOMMEUSES], [accountWith([TOMMEUSES], null)])
      .nativeElement as HTMLElement;

    expect(el.querySelector('.facts')).toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });
});
