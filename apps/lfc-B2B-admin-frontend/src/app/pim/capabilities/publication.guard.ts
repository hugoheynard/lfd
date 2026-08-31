import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';

import { PimCapabilitiesStore } from './pim-capabilities.store';

/**
 * Garde de route : ce déploiement **ouvre-t-il** la publication ?
 *
 * ⚠️ Ce n'est pas un droit, et c'est pour ça qu'il ne porte pas de
 * `permission` : `permissionGuard` répond « cette personne peut-elle », celui-ci
 * « cette installation propose-t-elle ». Un administrateur ne rouvre pas ces
 * écrans — il n'y a rien derrière eux ici.
 *
 * Redirigé vers l'accueil du référentiel plutôt que bloqué : renvoyer `false`
 * laisserait sur une page vide, sans rien dire de ce qu'on peut faire à la
 * place. Le lien n'est plus dans le rail ; celui qui arrive ici vient d'un
 * favori ou d'un lien collé.
 */
export const publicationEnabledGuard: CanActivateFn = (): boolean | UrlTree => {
  const capabilities = inject(PimCapabilitiesStore);
  const router = inject(Router);

  return capabilities.publication() ? true : router.parseUrl('/pim/catalogue');
};
