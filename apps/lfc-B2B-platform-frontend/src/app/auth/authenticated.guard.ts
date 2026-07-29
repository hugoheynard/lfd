import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthFacade } from './auth.facade';

/**
 * Protège les routes de l'espace professionnel. Non authentifié → redirection
 * vers `/login` en conservant la cible dans `returnTo`, pour y revenir après
 * connexion (deep-link préservé).
 *
 * Côté serveur, `authGate$()` émet `true` : le pré-rendu produit le squelette,
 * la vraie garde s'applique au navigateur une fois le SDK Auth0 chargé.
 */
export const authenticatedGuard: CanActivateFn = (_route, state) => {
  const facade = inject(AuthFacade);
  const router = inject(Router);

  return facade.authGate$().pipe(
    map((isAuthenticated) =>
      isAuthenticated
        ? true
        : router.createUrlTree(['/login'], {
            queryParams: { returnTo: state.url },
          }),
    ),
  );
};
