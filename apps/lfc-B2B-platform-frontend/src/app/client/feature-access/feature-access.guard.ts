import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { FeatureKey, FeatureLevel } from '@lfd/contracts';
// Valeur par le sous-chemin sans zod : la garde est chargée au démarrage, et le
// baril du contrat y tirait 355 ko de zod (build de déploiement en échec,
// mesuré le 2026-09-14).
import { isAtLeast } from '@lfd/contracts/feature-access-levels';
import { firstValueFrom } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientFeatureAccess } from './client-feature-access.service';

/** Où va qui est reconnu : son dossier est joignable à tous les niveaux. */
const SIGNED_IN_FALLBACK = '/mon-compte';
/**
 * Où va qui ne l'est pas : **l'accueil public**, joignable à tous les niveaux.
 *
 * ⚠️ L'adresse n'a pas bougé, son sens si (2026-09-16) : `/bienvenue` portait
 * l'inscription, et porte maintenant ce que voit un visiteur sans compte. Le
 * renvoi y gagne — on montre la boutique au lieu de réclamer un formulaire à
 * qui voulait seulement regarder.
 */
const SIGNED_OUT_FALLBACK = '/bienvenue';

/**
 * **N'ouvre la route qu'au niveau demandé**, ou renvoie vers un écran ouvert.
 *
 * Plan : `documentation/b2b/plan-inscription-pro-seule.md` §4. Ce n'est pas une
 * protection — l'API refuse d'elle-même — mais une adresse qui mène à un écran
 * dont chaque requête partirait en 409 n'a rien à montrer.
 *
 * Elle ATTEND la lecture des niveaux, jamais plus : un échec compte comme une
 * réponse (`closed`), et la lecture a son propre délai.
 *
 * ⚠️ Le renvoi lit `authGate$()` plutôt que `isAuthenticated()`. Au premier
 * chargement, le SDK Auth0 résout encore la session : `isAuthenticated` vaut
 * alors `false` pour une personne bel et bien connectée, qui partirait sur
 * `/bienvenue` au lieu de son dossier.
 */
export function featureAccessGuard(key: FeatureKey, required: FeatureLevel): CanActivateFn {
  return async () => {
    // Tout ce qui s'injecte l'est AVANT le premier `await` : le contexte
    // d'injection ne survit pas à une micro-tâche.
    const access = inject(ClientFeatureAccess);
    const auth = inject(AuthFacade);
    const router = inject(Router);

    void access.load();
    await access.settled();
    if (isAtLeast(key, access.levelOf(key), required)) {
      return true;
    }
    const signedIn = await firstValueFrom(auth.authGate$());
    return router.parseUrl(signedIn ? SIGNED_IN_FALLBACK : SIGNED_OUT_FALLBACK);
  };
}
