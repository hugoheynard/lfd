import { inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, firstValueFrom, of, timeout, catchError } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientFeatureAccess } from './feature-access/client-feature-access.service';
import { ClientWorkspace } from './client-workspace.service';

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
  if (workspace.current() === null) {
    await firstValueFrom(
      toObservable(workspace.current, { injector }).pipe(
        filter((current) => current !== null),
        timeout(WORKSPACE_WAIT_MS),
        catchError(() => of(null)),
      ),
    );
  }
  if (!workspace.isPersonal() || !workspace.hasChoice()) {
    return true;
  }
  void access.load();
  await access.settled();
  return access.atLeast('browse') ? router.parseUrl(PERSONAL_FALLBACK) : true;
};
