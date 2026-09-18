import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PERSONAL_WORKSPACE, type CompanyView, type ProfileView } from '@lfd/contracts';
import { afterEach, vi } from 'vitest';

import { AccountService } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../../client-workspace.fixture';
import { ClientWorkspaceSwitch } from '../../client-workspace-switch.service';
import { FR } from '../../copy/fr';
import { openShopAt } from '../../feature-access/feature-access.fixture';
import { PROFILE, TOMMEUSES } from '../../mon-compte/account.fixture';
import { ProfilePanel } from '../../profile/profile-panel/profile-panel';
import { ClientNav } from '../client-nav.service';
import { ClientMenu } from './client-menu';

interface Wire {
  profile: WritableSignal<ProfileView | null>;
  /** Chaque sortie du menu et chaque ouverture du profil, dans l'ordre où elles arrivent. */
  events: string[];
  logouts: number;
  workspace: WorkspaceDouble;
}

let wire: Wire;

function boot(
  profile: ProfileView | null = PROFILE,
  companies: readonly CompanyView[] = [],
): ComponentFixture<ClientMenu> {
  wire = {
    profile: signal(profile),
    events: [],
    logouts: 0,
    workspace: workspaceDouble(PERSONAL_WORKSPACE, companies),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ClientMenu],
    providers: [
      provideRouter([]),
      {
        provide: AuthFacade,
        useValue: {
          isAuthenticated: () => true,
          logout: (): void => {
            wire.logouts += 1;
          },
        },
      },
      { provide: AccountService, useValue: { profile: wire.profile } },
      // Les destinations ont leur propre suite : ici, aucune.
      { provide: ClientNav, useValue: { items: signal([]), current: signal('') } },
      provideWorkspace(wire.workspace),
      // La navigation de la bascule a sa propre suite : ici, on vérifie que le
      // menu la déclenche, et le choix arrive à l'espace par elle.
      {
        provide: ClientWorkspaceSwitch,
        useValue: {
          switchTo: (value: string): Promise<void> => {
            wire.workspace.choose(value);
            return Promise.resolve();
          },
        },
      },
    ],
  });
  openShopAt('order');
  const fixture = TestBed.createComponent(ClientMenu);
  fixture.componentRef.setInput('open', true);
  fixture.componentInstance.closed.subscribe(() => wire.events.push('closed'));
  fixture.detectChanges();
  return fixture;
}

const button = (fixture: ComponentFixture<ClientMenu>, text: string): HTMLButtonElement => {
  const found = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.foot button'),
  ).find((b) => b.textContent?.trim() === text);
  if (!found) {
    throw new Error(`Pas de bouton « ${text} ».`);
  }
  return found;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClientMenu', () => {
  /**
   * Le menu est un `<dialog>` modal : un dialogue fold ouvert pendant qu'il est
   * encore là resterait DESSOUS. Il se ferme donc d'abord.
   */
  it('« Mon profil » ferme le menu, PUIS ouvre le dialogue du profil', () => {
    const fixture = boot();
    const open = vi.spyOn(ProfilePanel, 'open').mockImplementation((_panels, profile) => {
      wire.events.push(`profile:${profile.email}`);
    });

    button(fixture, FR.chrome.myProfile).click();

    expect(open).toHaveBeenCalledTimes(1);
    expect(wire.events).toEqual(['closed', `profile:${PROFILE.email}`]);
  });

  it('« Mon profil » attend le profil : désactivé, et rien ne part, tant que `/me` n’a pas répondu', () => {
    const fixture = boot(null);
    const open = vi.spyOn(ProfilePanel, 'open').mockReturnValue(undefined);

    const item = button(fixture, FR.chrome.myProfile);
    expect(item.disabled).toBe(true);
    item.click();

    expect(open).not.toHaveBeenCalled();
  });

  it('« Se déconnecter » ferme le menu et appelle la sortie', () => {
    const fixture = boot();

    button(fixture, FR.nav.logout).click();

    expect(wire.events).toEqual(['closed']);
    expect(wire.logouts).toBe(1);
  });
});

/** Plan espace de travail, D8 : le même sélecteur qu'au bureau. */
describe('ClientMenu — le sélecteur d’espace', () => {
  const MAISON_A: CompanyView = { ...TOMMEUSES, id: 'cmp_a', enseigne: 'Maison A' };
  const spaces = (fixture: ComponentFixture<ClientMenu>): HTMLButtonElement[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.spaces .space'),
    );

  it('sans société, aucun sélecteur', () => {
    const fixture = boot();
    expect((fixture.nativeElement as HTMLElement).querySelector('.spaces')).toBeNull();
  });

  it('« Perso » puis la société, le courant marqué, et l’espace en cours dessous', () => {
    const fixture = boot(PROFILE, [MAISON_A]);

    expect(spaces(fixture).map((b) => b.textContent?.trim())).toEqual([
      FR.chrome.workspacePersonal,
      'Maison A',
    ]);
    expect(spaces(fixture).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.space-current')?.textContent?.trim(),
    ).toBe(FR.chrome.workspaceCurrentPersonal);
  });

  it('choisir la société bascule, et la coche la suit', () => {
    const fixture = boot(PROFILE, [MAISON_A]);

    spaces(fixture)[1]?.click();
    fixture.detectChanges();

    expect(wire.workspace.chosen).toEqual(['cmp_a']);
    expect(spaces(fixture)[1]?.querySelector('fold-icon')).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.space-current')?.textContent?.trim(),
    ).toBe('Maison A');
  });
});
