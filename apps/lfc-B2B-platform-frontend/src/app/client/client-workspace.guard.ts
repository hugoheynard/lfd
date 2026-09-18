import { inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, firstValueFrom, of, timeout, catchError } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientFeatureAccess } from './feature-access/client-feature-access.service';
import { ClientWorkspace } from './client-workspace.service';
import { COMPANY_HOME, PERSONAL_HOME } from './client-workspace-switch.service';

/** Où va qui est en perso : l'accueil, ouvert dès que la boutique se visite. */
const PERSONAL_FALLBACK = '/mon-espace';

/**
 * Le délai au bout duquel on cesse d'attendre `/me`. Passé, la garde laisse
 * passer : l'écran sait dire qu'il n'a pas pu lire le compte, une garde qui
 * pendrait ne dirait rien.
 */
const WORKSPACE_WAIT_MS = 8_000;

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
 * ⚠️ Pas de renvoi quand la boutique est fermée : `/mon-espace` renverrait
 * alors vers `/mon-compte` (le repli de `featureAccessGuard`), et les deux
 * gardes se renverraient la personne sans fin.
 */
export const companyWorkspaceGuard: CanActivateFn = async () => {
  // Tout ce qui s'injecte l'est AVANT le premier `await`.
  const workspace = inject(ClientWorkspace);
  const access = inject(ClientFeatureAccess);
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
  void access.load();
  await access.settled();
  return access.atLeast('browse') ? router.parseUrl(PERSONAL_FALLBACK) : true;
};

/**
 * **L'accueil de l'espace où l'on entre** — l'adresse que vise la connexion
 * (Hugo, 2026-09-17 : « la co en perso doit envoyer sur bienvenue »).
 *
 * La connexion part vers Auth0 avant qu'on sache dans quel espace la personne
 * reviendra : l'espace se lit sur `/me`, au retour. La cible ne peut donc pas
 * être écrite au départ ; elle se décide ici, une fois l'espace connu —
 * `/bienvenue` en perso, `/nouvelle-commande` dans une société, les mêmes
 * accueils que la bascule d'espace.
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
    return router.parseUrl(COMPANY_HOME);
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
