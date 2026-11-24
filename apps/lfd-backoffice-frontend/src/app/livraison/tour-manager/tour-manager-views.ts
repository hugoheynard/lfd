import { inject } from '@angular/core';
import { type RedirectFunction, Router } from '@angular/router';
import type { FoldViewNavItem } from 'fold-ng';

/**
 * Tour manager a deux onglets : les **Tournées** et les **Adresses** (le carnet
 * des adresses de livraison, demandé par Hugo le 2026-11-24). Le dossier du
 * jour s'ouvre depuis le bandeau. Ce fichier porte les onglets et les
 * redirections des anciennes adresses.
 */

/**
 * Les onglets de la coquille, liens routeur : l'actif suit l'URL. Le jour
 * (`?jour=`) suit d'un onglet à l'autre, pour revenir aux tournées du même jour.
 */
export const TOUR_MANAGER_TABS: readonly FoldViewNavItem[] = [
  {
    key: 'tournees',
    label: 'Tournées',
    icon: 'truck',
    link: '/tour-manager/tournees',
    queryParamsHandling: 'preserve',
  },
  {
    key: 'adresses',
    label: 'Adresses',
    icon: 'map-pin',
    link: '/tour-manager/adresses',
    queryParamsHandling: 'preserve',
  },
];

/** L'onglet des adresses : le bandeau du jour n'y a pas de sens. */
export function isAddressBookUrl(url: string): boolean {
  return url.split(/[?#]/)[0]?.endsWith('/adresses') ?? false;
}

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
 * Les tournées : où mènent `/tour-manager`, `/livraison` et
 * `/livraison/tournees` (le lien que la cloche écrit encore).
 */
export const toRoundsTab = redirectKeepingQuery('/tour-manager/tournees');
