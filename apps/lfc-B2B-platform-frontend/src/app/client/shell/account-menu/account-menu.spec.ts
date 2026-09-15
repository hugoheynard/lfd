import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { PERSONAL_WORKSPACE, type CompanyView, type ProfileView } from '@lfd/contracts';
import { afterEach, vi } from 'vitest';

import { AccountService } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientIdentity } from '../../client-identity.service';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../../client-workspace.fixture';
import { FR } from '../../copy/fr';
import { PROFILE, TOMMEUSES } from '../../mon-compte/account.fixture';
import { ProfilePanel } from '../../profile/profile-panel/profile-panel';
import { AccountMenu } from './account-menu';

interface Wire {
  recognised: WritableSignal<boolean>;
  profile: WritableSignal<ProfileView | null>;
  workspace: WorkspaceDouble;
  logouts: number;
}

let wire: Wire;

const MAISON_A: CompanyView = { ...TOMMEUSES, id: 'cmp_a', enseigne: 'Maison A' };
const MAISON_B: CompanyView = { ...TOMMEUSES, id: 'cmp_b', enseigne: '', raisonSociale: 'SAS B' };

function boot(
  recognised = true,
  profile: ProfileView | null = PROFILE,
  companies: readonly CompanyView[] = [],
  current: string = PERSONAL_WORKSPACE,
): ComponentFixture<AccountMenu> {
  wire = {
    recognised: signal(recognised),
    profile: signal(profile),
    workspace: workspaceDouble(current, companies),
    logouts: 0,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccountMenu],
    providers: [
      {
        provide: AuthFacade,
        useValue: {
          isAuthenticated: wire.recognised,
          logout: (): void => {
            wire.logouts += 1;
          },
        },
      },
      { provide: AccountService, useValue: { profile: wire.profile } },
      { provide: ClientIdentity, useValue: { firstName: signal('Hugo') } },
      provideWorkspace(wire.workspace),
    ],
  });
  const fixture = TestBed.createComponent(AccountMenu);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<AccountMenu>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/** Ouvre le menu par son déclencheur, et rend les entrées dans l'ordre. */
function openMenu(fixture: ComponentFixture<AccountMenu>): HTMLElement[] {
  host(fixture).querySelector<HTMLButtonElement>('button.who')?.click();
  fixture.detectChanges();
  return Array.from(document.querySelectorAll<HTMLElement>('fold-dropdown-item'));
}

/** Ouvre le menu, et rend l'entrée dont le texte est `text`. */
function openAndFind(fixture: ComponentFixture<AccountMenu>, text: string): HTMLButtonElement {
  const item = openMenu(fixture)
    .map((row) => row.querySelector<HTMLButtonElement>('button'))
    .find((b) => b?.textContent?.trim() === text);
  if (!item) {
    throw new Error(`Pas d'entrée « ${text} ».`);
  }
  return item;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountMenu', () => {
  it('le déclencheur est un vrai bouton, nommé, qui annonce un menu', () => {
    const trigger = host(boot()).querySelector<HTMLButtonElement>('button.who');

    expect(trigger?.getAttribute('aria-label')).toBe(`${FR.chrome.accountMenu} — Hugo`);
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.querySelector('.who-chip')?.textContent?.trim()).toBe('H');
  });

  it('le déclencheur ouvre le menu', () => {
    const fixture = boot();
    const menu = fixture.debugElement.children[0]?.componentInstance as { open: () => boolean };
    expect(menu.open()).toBe(false);

    host(fixture).querySelector<HTMLButtonElement>('button.who')?.click();
    fixture.detectChanges();

    expect(menu.open()).toBe(true);
  });

  it('« Mon profil » ouvre le dialogue du profil, sur le profil relu', () => {
    const fixture = boot();
    const open = vi.spyOn(ProfilePanel, 'open').mockReturnValue(undefined);

    openAndFind(fixture, FR.chrome.myProfile).click();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[1]).toEqual(PROFILE);
  });

  it('« Mon profil » attend le profil : désactivé tant que `/me` n’a pas répondu', () => {
    const fixture = boot(true, null);
    const open = vi.spyOn(ProfilePanel, 'open').mockReturnValue(undefined);

    const item = openAndFind(fixture, FR.chrome.myProfile);
    expect(item.disabled).toBe(true);
    item.click();
    expect(open).not.toHaveBeenCalled();
  });

  it('« Se déconnecter » appelle la même sortie que le menu de poche', () => {
    const fixture = boot();

    openAndFind(fixture, FR.nav.logout).click();

    expect(wire.logouts).toBe(1);
  });

  it('un visiteur non reconnu ne voit pas le bloc', () => {
    const fixture = boot(false);
    expect(host(fixture).querySelector('button.who')).toBeNull();
    expect(host(fixture).querySelector('fold-dropdown')).toBeNull();
  });
});

/** Plan espace de travail, D8 (Hugo, 2026-09-15). */
describe('AccountMenu — le sélecteur d’espace', () => {
  const labels = (rows: HTMLElement[]): string[] => rows.map((r) => r.textContent?.trim() ?? '');

  it('sans société, le menu reste tel qu’il était', () => {
    const rows = openMenu(boot());

    expect(labels(rows)).toEqual([FR.chrome.myProfile, FR.nav.logout]);
    expect(document.querySelector('.space-current')).toBeNull();
  });

  it('« Perso » en tête, puis une entrée par société — enseigne, raison sociale à défaut', () => {
    const rows = openMenu(boot(true, PROFILE, [MAISON_A, MAISON_B]));

    expect(labels(rows)).toEqual([
      FR.chrome.workspacePersonal,
      'Maison A',
      'SAS B',
      FR.chrome.myProfile,
      FR.nav.logout,
    ]);
  });

  it('marque l’espace courant, et lui seul', () => {
    const rows = openMenu(boot(true, PROFILE, [MAISON_A, MAISON_B], 'cmp_a'));

    expect(rows.slice(0, 3).map((row) => row.querySelector('fold-icon') !== null)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('sous le sélecteur, l’enseigne en cours — ou « Compte perso »', () => {
    const fixture = boot(true, PROFILE, [MAISON_A]);
    openMenu(fixture);
    expect(document.querySelector('.space-current')?.textContent?.trim()).toBe(
      FR.chrome.workspaceCurrentPersonal,
    );

    wire.workspace.current.set('cmp_a');
    fixture.detectChanges();

    expect(document.querySelector('.space-current')?.textContent?.trim()).toBe('Maison A');
  });

  it('choisir une société bascule l’espace', () => {
    const fixture = boot(true, PROFILE, [MAISON_A, MAISON_B]);

    openAndFind(fixture, 'SAS B').click();

    expect(wire.workspace.chosen).toEqual(['cmp_b']);
  });

  /** La ligne d'espace n'est pas une entrée : le nom du déclencheur la porte pour qui ne la voit pas. */
  it('le déclencheur dit l’espace en cours quand il y a un choix', () => {
    const fixture = boot(true, PROFILE, [MAISON_A], 'cmp_a');

    expect(host(fixture).querySelector('button.who')?.getAttribute('aria-label')).toBe(
      `${FR.chrome.accountMenu} — Hugo · ${FR.chrome.workspaceCurrentFor} Maison A`,
    );
  });
});
