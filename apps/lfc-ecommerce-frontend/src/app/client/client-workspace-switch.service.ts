import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { ClientWorkspace } from './client-workspace.service';
import { COMPANY_ONLY_ROUTES } from './nav/client-nav.service';

/**
 * 🔴 LES DEUX ESPACES ONT LE MÊME ACCUEIL DEPUIS LE 2026-09-20, et c'est une
 * décision de parcours, pas une simplification de code.
 *
 * Une société atterrissait sur `/nouvelle-commande`. Le jour où `/bienvenue` a
 * appris à servir les trois états — visiteur, perso, pro avec ses deux portes —
 * ça a cessé d'être un choix pour devenir un défaut : un pro ne voyait JAMAIS
 * ses deux portes, puisqu'il ne passait pas par l'écran qui les porte. Deux
 * écrans posaient la même question, et il atterrissait sur celui qui la pose le
 * moins bien (Hugo : « je pense que la page nouvelle commande ne sert plus » —
 * elle sert encore, mais plus comme accueil).
 *
 * ⚠️ `/nouvelle-commande` N'EST PAS RETIRÉE pour autant : elle porte le carnet
 * d'adresses, les zones de livraison et leurs frais, et c'est là que mène la
 * porte du coursier. Elle est le dos de cette porte, plus son vestibule.
 */
export const COMPANY_HOME = '/bienvenue';

/** L'accueil du PERSO : l'équivalent de la commande pour quelqu'un sans maison (Hugo, 2026-09-17). */
export const PERSONAL_HOME = '/bienvenue';

/**
 * Où aller quand `/me` n'a pas dit l'espace À TEMPS.
 *
 * ⚠️ Ce n'est PAS `COMPANY_HOME`, et ça l'a été tant que les deux coïncidaient.
 * La raison de ce repli n'a jamais été « c'est l'accueil d'une société » mais
 * « cet écran-là SAIT DIRE qu'il n'a pas pu lire le compte ». Les deux valeurs
 * étaient égales par accident ; les laisser confondues aurait fait perdre ce
 * message le jour où l'une a bougé — c'est-à-dire aujourd'hui.
 */
export const WORKSPACE_UNKNOWN_HOME = '/nouvelle-commande';

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
  // Les deux accueils coïncident depuis le 2026-09-20 : la comparaison reste
  // écrite avec LES DEUX NOMS, parce que c'est bien « suis-je sur un accueil ? »
  // qu'elle pose. Les réduire à un seul parce qu'ils ont la même valeur ferait
  // de cette égalité une hypothèse silencieuse.
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
