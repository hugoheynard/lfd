import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProfileView } from '@lfd/contracts';
import { afterEach, vi } from 'vitest';

import { AccountService } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientIdentity } from '../../client-identity.service';
import { FR } from '../../copy/fr';
import { PROFILE } from '../../mon-compte/account.fixture';
import { ProfilePanel } from '../../profile/profile-panel/profile-panel';
import { AccountMenu } from './account-menu';

interface Wire {
  recognised: WritableSignal<boolean>;
  profile: WritableSignal<ProfileView | null>;
  logouts: number;
}

let wire: Wire;

function boot(
  recognised = true,
  profile: ProfileView | null = PROFILE,
): ComponentFixture<AccountMenu> {
  wire = { recognised: signal(recognised), profile: signal(profile), logouts: 0 };
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
    ],
  });
  const fixture = TestBed.createComponent(AccountMenu);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<AccountMenu>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/** Ouvre le menu par son déclencheur, et rend l'entrée dont le texte est `text`. */
function openAndFind(fixture: ComponentFixture<AccountMenu>, text: string): HTMLButtonElement {
  host(fixture).querySelector<HTMLButtonElement>('button.who')?.click();
  fixture.detectChanges();
  const item = Array.from(
    document.querySelectorAll<HTMLButtonElement>('fold-dropdown-item button'),
  ).find((b) => b.textContent?.trim() === text);
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
