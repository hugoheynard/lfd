import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProfileView } from '@lfd/contracts';

import type { AccountStatus } from '../../../account/account.service';
import { AccountService } from '../../../account/account.service';
import type { LoginMethodsOutcome } from '../../../account/login-methods';
import { LoginMethodsService } from '../../../account/login-methods.service';
import { ClientChrome } from '../../client-chrome.service';
import { FR } from '../../copy/fr';
import { PROFILE } from '../../mon-compte/account.fixture';
import { ProfilePage } from './profile-page';

interface Wire {
  status: ReturnType<typeof signal<AccountStatus>>;
  profile: ReturnType<typeof signal<ProfileView | null>>;
  /** Les rattachements — la proposition de compte pro du bas les lit. */
  companies: ReturnType<typeof signal<readonly { id: string }[]>>;
  loads: number;
}

let wire: Wire;

function boot(status: AccountStatus = 'ready', profile: ProfileView | null = PROFILE): void {
  wire = {
    status: signal(status),
    profile: signal(profile),
    companies: signal<readonly { id: string }[]>([]),
    loads: 0,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfilePage],
    providers: [
      // La proposition de compte pro du bas mène par un `routerLink`.
      provideRouter([]),
      {
        provide: AccountService,
        useValue: {
          status: wire.status.asReadonly(),
          profile: wire.profile.asReadonly(),
          companies: wire.companies.asReadonly(),
          // La règle de `AccountService.hasNoCompany`, reproduite : la section
          // du bas ne s'affiche qu'une fois `/me` lu, et sans société.
          hasNoCompany: computed(() => wire.status() === 'ready' && wire.companies().length === 0),
          load: (): void => {
            wire.loads += 1;
          },
          saveMyProfile: (): Promise<string | null> => Promise.resolve(null),
        },
      },
      {
        provide: LoginMethodsService,
        useValue: {
          list: (): Promise<LoginMethodsOutcome> =>
            Promise.resolve({
              kind: 'loaded',
              methods: [{ provider: 'auth0', connection: 'lfc-b2b-customers', isPrimary: true }],
            }),
        },
      },
    ],
  });
}

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /**
   * Le châssis est celui de SES VOISINES sous `ClientShell` : le titre part
   * dans le bandeau bleu du shell (`clientBanner`), le contenu vit dans un
   * `.page` qui prend la gouttière `--lfc-inset`. Aucune page de ce shell
   * n'emploie `fold-page-layout` — la première consigne de ce lot disait le
   * contraire, et la page se serait lue autrement que ses sœurs (corrigé le
   * 2026-09-22).
   */
  it('porte le châssis du shell client, et non celui de fold', async () => {
    boot();
    await render();

    expect(el().querySelector('fold-page-layout')).toBeNull();
    expect(el().querySelector('.page')).not.toBeNull();

    // Le titre et l'accroche ne sont PAS ici : ils partent dans le bandeau du
    // shell par `clientBanner`, qui les rend hors du DOM de la page. Les
    // chercher dans `el()` reviendrait à tester le shell depuis l'écran — et
    // c'est ce que faisait la première version de ce cas, qui passait tant que
    // la page portait son propre gabarit.
    expect(el().textContent).not.toContain(FR.account.profilePageLead);
  });

  it('porte les deux sections, l’identité d’abord', async () => {
    boot();
    await render();

    const sections = Array.from(el().querySelectorAll('fold-page-section'));
    expect(sections.length).toBe(2);
    expect(sections[0]?.querySelector('app-identity-section')).not.toBeNull();
    expect(sections[0]?.textContent).toContain(FR.account.profileIdentityTitle);
    expect(sections[1]?.querySelector('app-login-methods-section')).not.toBeNull();
    expect(sections[1]?.textContent).toContain(FR.account.loginMethodsTitle);
  });

  /** « Pas encore su » n'est pas « vide » : aucun champ ne se montre à blanc. */
  it('pendant la lecture de `/me`, montre le chargement fold et aucune section', async () => {
    boot('loading', null);
    await render();

    expect(el().querySelector('fold-loading')).not.toBeNull();
    expect(el().querySelectorAll('fold-page-section').length).toBe(0);
  });

  it('sur un échec de lecture, montre l’état d’erreur fold et relit au clic', async () => {
    boot('error', null);
    await render();

    const empty = el().querySelector('fold-empty-state[tone="alert"]');
    expect(empty?.textContent).toContain(FR.account.loadFailedTitle);

    empty?.querySelector('button')?.click();
    expect(wire.loads).toBe(1);
  });

  /**
   * Le chrome du shell : la page n'a pas de retour — elle est une destination,
   * pas une étape — et garde l'accès au menu.
   */
  it('publie son chrome : menu ouvert, pas de flèche de retour', async () => {
    boot();
    await render();
    const chrome = TestBed.inject(ClientChrome);

    expect(chrome.menu()).toBe(true);
    expect(chrome.back()).toBeNull();
  });
});
