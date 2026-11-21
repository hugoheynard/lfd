import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { parisToday } from '../shared/paris-today';
import { scopeDays } from './orders-scope';

/**
 * **La liste des commandes s'ouvre sur demain** (décidé par Hugo le
 * 2026-11-21) : c'est la journée qu'on prépare. Seule une arrivée **sans
 * aucun paramètre** (le menu, un retour par défaut) est recadrée ; une
 * adresse qui porte déjà un filtre, un onglet ou une page est respectée.
 *
 * Choisir « Toutes » dans la page ne repasse pas par ici : Angular ne rejoue
 * pas les gardes quand seuls les paramètres d'adresse changent. Recharger la
 * page sous « Toutes » la rouvre sur demain.
 */
export const ordersDefaultScopeGuard: CanActivateFn = (route) => {
  if (Object.keys(route.queryParams).length > 0) {
    return true;
  }
  const days = scopeDays('tomorrow', parisToday());
  return inject(Router).createUrlTree(['/commandes'], {
    queryParams: { fulfillmentFrom: days.fulfillmentFrom, fulfillmentTo: days.fulfillmentTo },
  });
};
