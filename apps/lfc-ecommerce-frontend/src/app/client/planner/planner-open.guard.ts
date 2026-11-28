import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { PlannerAccessStore } from './planner-access.store';

/**
 * **`/planificateur` ne s'ouvre que si le planificateur l'est dans l'espace
 * affiché** — la même lecture que le menu (`GET /planner/access`, rangée par
 * espace). Fermé, ou inconnu (lecture en échec), l'adresse renvoie au rayon :
 * un écran dont chaque requête partirait en 409 n'a rien à montrer.
 *
 * Ce n'est pas la protection : l'API refuse elle-même les routes du
 * planificateur quand la société de l'espace n'y a pas accès.
 */
export const plannerOpenGuard: CanActivateFn = async () => {
  // Tout ce qui s'injecte l'est AVANT le premier `await`.
  const access = inject(PlannerAccessStore);
  const router = inject(Router);
  return (await access.openHere()) ? true : router.parseUrl('/boutique');
};
