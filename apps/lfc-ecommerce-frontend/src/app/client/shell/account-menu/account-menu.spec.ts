import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
import { ClientWorkspaceSwitch } from '../../client-workspace-switch.service';
import { FR } from '../../copy/fr';
import { PROFILE, TOMMEUSES } from '../../mon-compte/account.fixture';
import { ClientNav, type NavItem } from '../../nav/client-nav.service';
import { ProfilePanel } from '../../profile/profile-panel/profile-panel';
import { AccountMenu } from './account-menu';

interface Wire {
  recognised: WritableSignal<boolean>;
  profile: WritableSignal<ProfileView | null>;
  workspace: WorkspaceDouble;
  items: WritableSignal<readonly NavItem[]>;
  logouts: number;
}

let wire: Wire;

const MAISON_A: CompanyView = {
  ...TOMMEUSES,
  id: 'cmp_a',
  enseigne: 'Chalet Marmotte',
  raisonSociale: 'SAS Marmotte',
};
const MAISON_B: CompanyView = { ...TOMMEUSES, id: 'cmp_b', enseigne: '', raisonSociale: 'SAS B' };

/** Une destination, dans la forme que `ClientNav` rend au menu. */
function item(partial: Partial<NavItem> & Pick<NavItem, 'id' | 'label' | 'route'>): NavItem {
  return { ready: true, count: '', countShort: '', warn: false, ...partial };
}

const DESTINATIONS: readonly NavItem[] = [
  item({ id: 'shop', label: 'Boutique', route: '/commande/boutique' }),
  item({
    id: 'orders',
    label: 'Commandes',
    route: '/mes-commandes',
    count: '3',
    countShort: '3',
  }),
  item({ id: 'baskets', label: 'Paniers récurrents', route: '/paniers-recurrents', ready: false }),
];

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
    items: signal(DESTINATIONS),
    logouts: 0,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccountMenu],
    providers: [
      provideRouter([]),
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
      {
        provide: ClientIdentity,
        useValue: {
          firstName: signal('Camille'),
          fullName: signal('Camille Roux'),
          email: signal('camille@chaletmarmotte.fr'),
        },
      },
      {
        provide: ClientNav,
        useValue: { items: wire.items, current: signal('/commande/boutique') },
      },
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
  const fixture = TestBed.createComponent(AccountMenu);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<AccountMenu>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/**
 * Ouvre le panneau par son déclencheur.
 *
 * ⚠️ Le panneau est TOUJOURS dans le DOM — `fold-popover` le montre par l'API
 * `popover`, il ne le construit pas au clic. Son ouverture se lit donc sur
 * `aria-expanded`, que la directive de déclenchement pose, et jamais sur la
 * présence de l'élément.
 */
function openPanel(fixture: ComponentFixture<AccountMenu>): HTMLElement {
  trigger(fixture)?.click();
  fixture.detectChanges();
  const panel = host(fixture).querySelector<HTMLElement>('.panel');
  if (panel === null) {
    throw new Error('Pas de panneau.');
  }
  return panel;
}

const trigger = (fixture: ComponentFixture<AccountMenu>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button.who');

const expanded = (fixture: ComponentFixture<AccountMenu>): string | null =>
  trigger(fixture)?.getAttribute('aria-expanded') ?? null;

/** Le texte de chaque élément retenu, détassé. */
const texts = (root: ParentNode, selector: string): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>(selector)).map(
    (el) => el.textContent?.trim() ?? '',
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountMenu — le déclencheur', () => {
  it('est un vrai bouton, nommé, qui annonce un menu', () => {
    const button = trigger(boot());

    expect(button?.getAttribute('aria-label')).toBe(`${FR.chrome.accountMenu} — Camille`);
    expect(button?.getAttribute('aria-haspopup')).toBe('menu');
  });

  /** La pastille porte l'ESPACE, pas la personne : c'est pour lui qu'on commande. */
  it('porte les initiales de l’espace, et le rôle sous son nom', () => {
    const fixture = boot(true, PROFILE, [MAISON_A], 'cmp_a');

    expect(host(fixture).querySelector('.who-chip')?.textContent?.trim()).toBe('CM');
    expect(host(fixture).querySelector('.who-space')?.textContent?.trim()).toBe('Chalet Marmotte');
    expect(host(fixture).querySelector('.who-person')?.textContent?.trim()).toBe(
      `Camille · ${FR.chrome.workspaceRolePro}`,
    );
  });

  it('en perso, la seconde ligne dit le compte perso', () => {
    expect(host(boot()).querySelector('.who-person')?.textContent?.trim()).toBe(
      `Camille · ${FR.chrome.workspaceCurrentPersonal}`,
    );
  });

  it('ouvre le panneau', () => {
    const fixture = boot();
    expect(expanded(fixture)).toBe('false');

    openPanel(fixture);

    expect(expanded(fixture)).toBe('true');
  });

  it('un visiteur non reconnu ne voit pas le bloc', () => {
    const fixture = boot(false);
    expect(host(fixture).querySelector('button.who')).toBeNull();
    expect(host(fixture).querySelector('fold-popover')).toBeNull();
  });
});

describe('AccountMenu — la bande de tête', () => {
  it('nomme la PERSONNE et son adresse, initiales comprises', () => {
    const panel = openPanel(boot());

    expect(panel.querySelector('.head-avatar')?.textContent?.trim()).toBe('CR');
    expect(panel.querySelector('.head-title')?.textContent?.trim()).toBe('Camille Roux');
    expect(panel.querySelector('.head-note')?.textContent?.trim()).toBe(
      'camille@chaletmarmotte.fr',
    );
  });
});

/** Plan espace de travail, D8 (Hugo, 2026-09-15). */
describe('AccountMenu — les espaces', () => {
  it('sans société, la section n’existe pas', () => {
    expect(openPanel(boot()).querySelector('.spaces')).toBeNull();
  });

  it('une carte par espace : le perso en tête, puis les sociétés', () => {
    const panel = openPanel(boot(true, PROFILE, [MAISON_A, MAISON_B]));

    expect(texts(panel, '.space-name')).toEqual([
      FR.chrome.workspacePersonal,
      'Chalet Marmotte',
      'SAS B',
    ]);
    expect(texts(panel, '.space-kind')).toEqual([
      FR.chrome.workspaceKindPersonal,
      FR.chrome.workspaceKindPro,
      FR.chrome.workspaceKindPro,
    ]);
    expect(texts(panel, '.space-note')).toEqual([
      FR.chrome.workspacePersonalNote,
      'SAS Marmotte',
      'SAS B',
    ]);
  });

  it('marque l’espace courant, et lui seul', () => {
    const panel = openPanel(boot(true, PROFILE, [MAISON_A, MAISON_B], 'cmp_a'));

    expect(
      Array.from(panel.querySelectorAll('.space')).map((el) => el.getAttribute('aria-pressed')),
    ).toEqual(['false', 'true', 'false']);
  });

  it('choisir une société bascule l’espace, et referme le panneau', () => {
    const fixture = boot(true, PROFILE, [MAISON_A, MAISON_B]);
    const panel = openPanel(fixture);

    panel.querySelectorAll<HTMLButtonElement>('.space')[2]?.click();
    fixture.detectChanges();

    expect(wire.workspace.chosen).toEqual(['cmp_b']);
    expect(expanded(fixture)).toBe('false');
  });
});

describe('AccountMenu — les destinations', () => {
  it('les rend dans l’ordre de `ClientNav`, sans en réordonner aucune', () => {
    const panel = openPanel(boot());

    expect(texts(panel, '.row-label')).toEqual(['Boutique', 'Commandes', 'Paniers récurrents']);
  });

  it('un compteur devient une note ET un badge', () => {
    const panel = openPanel(boot());
    const rows = Array.from(panel.querySelectorAll<HTMLElement>('.row'));

    expect(rows[1]?.querySelector('.row-note')?.textContent?.trim()).toBe('3');
    expect(rows[1]?.querySelector('.row-badge')?.textContent?.trim()).toBe('3');
  });

  /** L'écran n'existe pas encore : la place reste, le clic non. */
  it('une destination sans écran est désactivée et porte le mot d’attente', () => {
    const panel = openPanel(boot());
    const soon = panel.querySelectorAll<HTMLElement>('.row')[2];

    expect(soon?.tagName).toBe('BUTTON');
    expect((soon as HTMLButtonElement | undefined)?.disabled).toBe(true);
    expect(soon?.querySelector('.row-badge')?.textContent?.trim()).toBe(FR.nav.soon);
  });
});

describe('AccountMenu — le pied', () => {
  it('« Mon profil » ouvre le dialogue du profil, sur le profil relu', () => {
    const fixture = boot();
    const open = vi.spyOn(ProfilePanel, 'open').mockReturnValue(undefined);
    const panel = openPanel(fixture);

    panel.querySelectorAll<HTMLButtonElement>('.foot-action')[0]?.click();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[1]).toEqual(PROFILE);
  });

  it('« Mon profil » attend le profil : désactivé tant que `/me` n’a pas répondu', () => {
    const fixture = boot(true, null);
    const open = vi.spyOn(ProfilePanel, 'open').mockReturnValue(undefined);
    const panel = openPanel(fixture);
    const profile = panel.querySelectorAll<HTMLButtonElement>('.foot-action')[0];

    expect(profile?.disabled).toBe(true);
    profile?.click();

    expect(open).not.toHaveBeenCalled();
  });

  it('« Se déconnecter » appelle la même sortie que le menu de poche', () => {
    const fixture = boot();
    const panel = openPanel(fixture);

    panel.querySelectorAll<HTMLButtonElement>('.foot-action')[1]?.click();

    expect(wire.logouts).toBe(1);
  });
});
