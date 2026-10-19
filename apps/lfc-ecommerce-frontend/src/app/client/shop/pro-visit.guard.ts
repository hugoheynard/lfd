import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { ProVisit } from './pro-visit.service';

/**
 * **Pas de règlement pendant une visite pro** (Hugo, 2026-10-19 : « un pro non
 * loggé ne doit pas pouvoir commander »). La route de règlement renvoie à la
 * connexion, en gardant sa cible dans `returnTo` comme `authenticatedGuard` :
 * une fois reconnue, la personne n'est plus en visite pro et la route s'ouvre.
 *
 * Hors visite pro, rien ne change : le visiteur règle sans compte.
 */
export const noProVisitGuard: CanActivateFn = (_route, state) =>
  inject(ProVisit).active()
    ? inject(Router).createUrlTree(['/login'], { queryParams: { returnTo: state.url } })
    : true;
