import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PERSONAL_WORKSPACE } from '@lfd/contracts';

import {
  ClientWorkspaceSwitch,
  COMPANY_HOME,
  PERSONAL_HOME,
  routeAfterSwitch,
  WORKSPACE_RELOAD_ROUTE,
} from './client-workspace-switch.service';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

describe('routeAfterSwitch — où l’on va après avoir changé d’espace', () => {
  it('passe de l’accueil de la société à celui du perso', () => {
    expect(routeAfterSwitch(COMPANY_HOME, true)).toBe(PERSONAL_HOME);
  });

  it('passe de l’accueil du perso à celui de la société', () => {
    expect(routeAfterSwitch(PERSONAL_HOME, false)).toBe(COMPANY_HOME);
  });

  it('reconnaît un accueil malgré sa requête', () => {
    expect(routeAfterSwitch(`${COMPANY_HOME}?retour=panier`, true)).toBe(PERSONAL_HOME);
  });

  it.each(['/mon-compte', '/mes-factures'])(
    'quitte l’écran de société %s en passant en perso',
    (route) => {
      expect(routeAfterSwitch(route, true)).toBe(PERSONAL_HOME);
    },
  );

  it('garde un écran de société quand on change de société', () => {
    expect(routeAfterSwitch('/mon-compte', false)).toBe('/mon-compte');
  });

  it('reste sur un écran commun aux deux espaces, requête comprise', () => {
    expect(routeAfterSwitch('/mes-commandes?filtre=en-cours', true)).toBe(
      '/mes-commandes?filtre=en-cours',
    );
    expect(routeAfterSwitch('/boutique', false)).toBe('/boutique');
  });
});

@Component({ template: '' })
class Blank {}

describe('ClientWorkspaceSwitch', () => {
  let workspace: WorkspaceDouble;
  let router: Router;
  let visited: string[];

  async function startOn(url: string, current: string): Promise<ClientWorkspaceSwitch> {
    workspace = workspaceDouble(current, [TOMMEUSES]);
    TestBed.configureTestingModule({
      providers: [
        provideWorkspace(workspace),
        provideRouter(
          [
            'nouvelle-commande',
            'bienvenue',
            'mes-commandes',
            'mon-compte',
            'changement-d-espace',
          ].map((path) => ({ path, component: Blank })),
        ),
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    visited = [];
    router.events.subscribe((event) => {
      if ('urlAfterRedirects' in event && event.constructor.name === 'NavigationEnd') {
        visited.push(event.urlAfterRedirects);
      }
    });
    return TestBed.inject(ClientWorkspaceSwitch);
  }

  /**
   * Régression : changer d'espace laissait l'écran tel quel — monté dans
   * l'ancien espace, et sur `/nouvelle-commande` même en perso (Hugo,
   * 2026-09-17).
   */
  it('🔴 remonte l’écran à neuf en passant par le détour, puis revient sur place', async () => {
    const switcher = await startOn('/mes-commandes', TOMMEUSES.id);

    await switcher.switchTo(PERSONAL_WORKSPACE);

    expect(workspace.chosen).toEqual([PERSONAL_WORKSPACE]);
    expect(visited).toEqual([WORKSPACE_RELOAD_ROUTE, '/mes-commandes']);
    expect(router.url).toBe('/mes-commandes');
  });

  it('🔴 envoie à l’accueil du perso depuis la prise de commande', async () => {
    const switcher = await startOn(COMPANY_HOME, TOMMEUSES.id);

    await switcher.switchTo(PERSONAL_WORKSPACE);

    expect(router.url).toBe(PERSONAL_HOME);
  });

  it('ne bouge pas quand l’espace choisi est déjà le courant', async () => {
    const switcher = await startOn('/mes-commandes', TOMMEUSES.id);

    await switcher.switchTo(TOMMEUSES.id);

    expect(visited).toEqual([]);
  });
});
