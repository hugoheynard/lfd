import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';

/**
 * **`/planificateur` ne s'ouvre que si la clé `orderPlanner` l'est pour cette
 * personne** — la même lecture que le menu, exemption comprise. Fermé, ou
 * inconnu (lecture en échec), l'adresse renvoie au rayon : un écran dont chaque
 * requête partirait en 409 n'a rien à montrer.
 *
 * Ce n'est pas la protection : l'API refuse elle-même les routes du
 * planificateur quand la clé est fermée.
 */
export const plannerOpenGuard: CanActivateFn = async () => {
  // Tout ce qui s'injecte l'est AVANT le premier `await`.
  const features = inject(ClientFeatureAccess);
  const router = inject(Router);
  void features.load();
  await features.settled();
  return features.orderPlannerOpen() ? true : router.parseUrl('/boutique');
};
