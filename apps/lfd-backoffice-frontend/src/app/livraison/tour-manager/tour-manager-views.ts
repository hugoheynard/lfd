import { inject } from '@angular/core';
import { type RedirectFunction, Router } from '@angular/router';

/**
 * Tour manager est **un seul écran** depuis le 2026-10-26 (décision de Hugo) :
 * l'onglet « Feuille de route », posé le matin même, est retiré, et le dossier
 * du jour ouvert depuis le bandeau porte ce qu'il montrait. Restent les
 * redirections de ses anciennes adresses.
 */

/**
 * Une redirection ABSOLUE qui garde les paramètres de requête. Le routeur les
 * jette sur un `redirectTo` absolu écrit en chaîne (constaté le 2026-10-26 par
 * `tour-manager-entry-access.spec.ts`) — et `?jour=` est précisément ce que
 * portent les favoris de la feuille de route et des tournées.
 */
export function redirectKeepingQuery(target: string): RedirectFunction {
  return ({ queryParams }) => inject(Router).createUrlTree([target], { queryParams });
}

/**
 * Les tournées : où mènent `/tour-manager`, les anciennes adresses de la
 * feuille de route (`/livraison`, `/livraison/feuille-de-route`,
 * `/tour-manager/feuille-de-route`) et `/livraison/tournees`.
 */
export const toRoundsTab = redirectKeepingQuery('/tour-manager/tournees');
