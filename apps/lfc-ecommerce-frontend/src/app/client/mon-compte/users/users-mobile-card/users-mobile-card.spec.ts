import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { UserAddPanel } from '../user-add-panel/user-add-panel';
import { UsersPanel } from '../users-panel/users-panel';
import { UsersMobileCard } from './users-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('UsersMobileCard', () => {
  const feet = (el: HTMLElement): HTMLButtonElement[] =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-card-foot button'));

  it('garde la carte bleue du détenteur, sans la liste des contacts', () => {
    const el = bootCard(UsersMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;

    expect(el.querySelector('.holder-name')?.textContent).toContain('Hugo Heynard');
    expect(el.querySelector('.holder-tag')?.textContent).toContain(FR.account.usersAllRights);
    expect(el.querySelector('.person')).toBeNull();
    expect(el.textContent).not.toContain(FR.account.usersNote);
  });

  it('« Voir le détail » ouvre la liste, « Ajouter un utilisateur » le panneau d’ajout', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = bootCard(UsersMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;
    const [details, add] = feet(el);
    expect(details?.textContent).toContain(FR.account.details);
    expect(add?.textContent).toContain(FR.account.usersAddShort);

    details?.click();
    expect(openedPanel()?.component).toBe(UsersPanel);

    TestBed.inject(FoldPanelHostService).dismissAll();
    add?.click();
    expect(openedPanel()?.component).toBe(UserAddPanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1' });
  });

  /** L'API refuse l'ajout hors `owner`/`admin` : aux autres, pas de bouton qui finirait en refus. */
  it('n’offre l’ajout qu’aux rôles qui écrivent', () => {
    for (const role of ['orders', 'billing'] as const) {
      const el = bootCard(UsersMobileCard, [asRole(role)]).nativeElement as HTMLElement;
      expect(feet(el).map((b) => b.textContent?.trim())).toEqual([FR.account.details]);
    }
  });
});
