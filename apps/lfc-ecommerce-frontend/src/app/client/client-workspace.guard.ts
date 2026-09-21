import { inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, firstValueFrom, of, timeout, catchError } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientWorkspace } from './client-workspace.service';
import {
  COMPANY_HOME,
  PERSONAL_HOME,
  WORKSPACE_UNKNOWN_HOME,
} from './client-workspace-switch.service';

/**
 * Où va qui est en perso.
 *
 * 🔴 `/bienvenue` depuis le 2026-09-21 (Hugo : « bienvenue devient le
 * fallback »), et ce n'est pas qu'un renommage : c'était `/mon-espace`, qui
 * portait une GARDE de boutique. Le repli pouvait donc rebondir — voir la
 * remarque de `companyWorkspaceGuard`, qui n'a plus d'objet. `/bienvenue` n'a
 * aucune garde : un repli qui ne peut pas rebondir n'a plus besoin qu'on
 * vérifie où il tombe.
 */
const PERSONAL_FALLBACK = PERSONAL_HOME;

/**
 * Le délai au bout duquel on cesse d'attendre `/me`. Passé, la garde laisse
 * passer : l'écran sait dire qu'il n'a pas pu lire le compte, une garde qui
 * pendrait ne dirait rien.
 */
/**
 * Exportée pour que son SPEC puisse s'accorder le temps qu'elle prend : le cas
 * du repli attend vraiment `/me`, et le délai par défaut d'une suite est plus
 * court. Le recopier dans le test ferait deux nombres à tenir d'accord.
 */
export const WORKSPACE_WAIT_MS = 8_000;

/**
 * **Les écrans d'une SOCIÉTÉ se ferment en perso** — Mon compte (le dossier) et
 * Mes factures (le relevé) n'ont rien à montrer pour aucune maison (Hugo,
 * 2026-09-15). Le menu les retire ; cette garde ferme l'adresse tapée ou gardée
 * en favori.
 *
 * Seulement pour qui **a** une société et a basculé en perso. Sans aucune
 * société, `/mon-compte` reste ouvert : c'est là que revient la porte pro
 * (`ProOnboarding`, cf. `client-shell.ts`), avant que la société existe.
 *
 * ⚠️ **Le renvoi est INCONDITIONNEL depuis le 2026-09-21.** Il attendait que
 * la boutique soit au moins visitable, pour une seule raison : le repli était
 * `/mon-espace`, que `featureAccessGuard` renvoyait vers `/mon-compte` quand la
 * boutique était fermée — les deux gardes se seraient renvoyé la personne sans
 * fin. Le repli est maintenant `/bienvenue`, qui n'a aucune garde : la boucle
 * est devenue impossible, et la condition qui l'évitait, du décor. La retirer
 * ferme enfin l'adresse dans le cas qu'elle laissait passer — boutique fermée,
 * société, bascule en perso.
 */
export const companyWorkspaceGuard: CanActivateFn = async () => {
  // Tout ce qui s'injecte l'est AVANT le premier `await`.
  const workspace = inject(ClientWorkspace);
  const auth = inject(AuthFacade);
  const router = inject(Router);
  const injector = inject(Injector);

  if (!(await firstValueFrom(auth.authGate$()))) {
    return true;
  }
  await workspaceKnown(workspace, injector);
  if (!workspace.isPersonal() || !workspace.hasChoice()) {
    return true;
  }
  return router.parseUrl(PERSONAL_FALLBACK);
};

/**
 * **L'accueil de l'espace où l'on entre** — l'adresse que vise la connexion
 * (Hugo, 2026-09-17 : « la co en perso doit envoyer sur bienvenue »).
 *
 * La connexion part vers Auth0 avant qu'on sache dans quel espace la personne
 * reviendra : l'espace se lit sur `/me`, au retour. La cible ne peut donc pas
 * être écrite au départ ; elle se décide ici, une fois l'espace connu.
 * Depuis le 2026-09-20 c'est `/bienvenue` DANS LES DEUX CAS : l'écran sert les
 * trois états, et le pro y trouve ses deux portes. Les mêmes accueils que la
 * bascule d'espace.
 *
 * Si `/me` ne répond pas à temps, on retombe sur la prise de commande : c'était
 * la cible de la connexion jusqu'ici, et son écran sait dire qu'il n'a pas pu
 * lire le compte.
 */
export const workspaceHomeGuard: CanActivateFn = async () => {
  const workspace = inject(ClientWorkspace);
  const auth = inject(AuthFacade);
  const router = inject(Router);
  const injector = inject(Injector);

  if (!(await firstValueFrom(auth.authGate$()))) {
    return router.parseUrl(PERSONAL_HOME);
  }
  await workspaceKnown(workspace, injector);
  if (workspace.current() === null) {
    return router.parseUrl(WORKSPACE_UNKNOWN_HOME);
  }
  return router.parseUrl(workspace.isPersonal() ? PERSONAL_HOME : COMPANY_HOME);
};

/** Attend que `/me` ait dit l'espace — au plus {@link WORKSPACE_WAIT_MS}. */
async function workspaceKnown(workspace: ClientWorkspace, injector: Injector): Promise<void> {
  if (workspace.current() !== null) {
    return;
  }
  await firstValueFrom(
    toObservable(workspace.current, { injector }).pipe(
      filter((current) => current !== null),
      timeout(WORKSPACE_WAIT_MS),
      catchError(() => of(null)),
    ),
  );
}
