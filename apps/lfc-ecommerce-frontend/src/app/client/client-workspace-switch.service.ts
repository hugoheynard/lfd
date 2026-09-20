import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { ClientWorkspace } from './client-workspace.service';
import { COMPANY_ONLY_ROUTES } from './nav/client-nav.service';

/** L'accueil d'une SOCIÉTÉ : on y commande (c'est là qu'on atterrit en se connectant). */
export const COMPANY_HOME = '/nouvelle-commande';

/** L'accueil du PERSO : l'équivalent de la commande pour quelqu'un sans maison (Hugo, 2026-09-17). */
export const PERSONAL_HOME = '/bienvenue';

/**
 * **L'entrée** : une adresse sans écran, que `workspaceHomeGuard` redirige vers
 * l'accueil de l'espace une fois `/me` relu. C'est la cible de la connexion.
 */
export const WORKSPACE_HOME_ROUTE = '/accueil';

/** Le détour qui fait remonter l'écran de destination à neuf (cf. `WorkspaceReload`). */
export const WORKSPACE_RELOAD_ROUTE = '/changement-d-espace';

/**
 * **Où aller après avoir changé d'espace**, depuis l'adresse où l'on était.
 *
 * - depuis un **accueil** — celui de la société ou celui du perso —, on va à
 *   l'accueil du nouvel espace : les deux se correspondent, et rester sur
 *   `/nouvelle-commande` en perso ne serait pas l'équivalent ;
 * - depuis un **écran de société** en passant en perso, on va à l'accueil du
 *   perso : le menu le retire, et la garde le fermerait de toute façon ;
 * - partout ailleurs, on **reste**, et l'écran se reconstruit.
 *
 * La requête et le fragment sont gardés quand on reste, ignorés pour décider.
 */
export function routeAfterSwitch(url: string, nowPersonal: boolean): string {
  const path = url.split(/[?#]/u)[0] ?? url;
  const home = nowPersonal ? PERSONAL_HOME : COMPANY_HOME;
  if (path === COMPANY_HOME || path === PERSONAL_HOME) {
    return home;
  }
  if (
    nowPersonal &&
    COMPANY_ONLY_ROUTES.some((route) => path === route || path.startsWith(`${route}/`))
  ) {
    return home;
  }
  return url;
}

/**
 * **Changer d'espace, et que l'écran suive** (Hugo, 2026-09-17 : « quand je
 * switch d'espace pour me mettre en perso, ça devrait recharger la page »).
 *
 * `ClientWorkspace.choose` ne fait que déclarer l'espace : les services qui le
 * lisent se relisent, mais l'écran monté garde ce qu'il avait calculé, et
 * l'adresse ne bouge pas même quand elle n'a plus de sens dans le nouvel
 * espace. Ce service est le geste complet, partagé par les deux menus.
 *
 * Il ne recharge PAS la page du navigateur : l'espace est enregistré par un
 * appel qui part en même temps, et un rechargement complet pourrait relire
 * `/me` avant qu'il n'ait abouti — donc revenir dans l'ancien espace.
 */
@Injectable({ providedIn: 'root' })
export class ClientWorkspaceSwitch {
  private readonly workspace = inject(ClientWorkspace);
  private readonly router = inject(Router);

  async switchTo(value: string): Promise<void> {
    const before = this.workspace.current();
    this.workspace.choose(value);
    if (this.workspace.current() === before) {
      return;
    }
    const target = routeAfterSwitch(this.router.url, this.workspace.isPersonal());
    await this.router.navigateByUrl(WORKSPACE_RELOAD_ROUTE, { skipLocationChange: true });
    await this.router.navigateByUrl(target, { replaceUrl: true });
  }
}
