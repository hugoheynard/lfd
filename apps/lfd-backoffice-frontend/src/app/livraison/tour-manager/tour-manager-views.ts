import { inject } from '@angular/core';
import { type RedirectFunction, Router } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import type { FoldViewNavItem } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';

/** Un onglet de Tour manager, et le droit de sa route. */
export interface TourManagerView extends FoldViewNavItem {
  readonly link: string;
  /** Un seul de ces droits suffit. */
  readonly needsAnyOf: readonly StaffPermission[];
}

/**
 * Les onglets de **Tour manager** (décision de Hugo, 2026-10-26 : « la
 * Feuille de route devient un onglet de Tour manager ») — sur le modèle de
 * Prod manager : un espace à routes enfants, chacune gardée par son droit.
 * Qui ne lit que la feuille de route (le support) voit Tour manager avec ce
 * seul onglet ; qui ne lit que les tournées, le seul onglet Tournées.
 */
export const TOUR_MANAGER_VIEWS: readonly TourManagerView[] = [
  {
    key: 'tournees',
    label: 'Tournées',
    link: '/tour-manager/tournees',
    icon: 'places',
    needsAnyOf: ['delivery_rounds:read'],
  },
  {
    key: 'feuille-de-route',
    label: 'Feuille de route',
    link: '/tour-manager/feuille-de-route',
    icon: 'list',
    needsAnyOf: ['delivery_run_sheet:read'],
  },
];

/** Les droits qui ouvrent au moins un onglet — ceux de l'entrée du menu. */
export const TOUR_MANAGER_PERMISSIONS: readonly StaffPermission[] = [
  ...new Set(TOUR_MANAGER_VIEWS.flatMap((view) => view.needsAnyOf)),
];

/** Les onglets que ces droits ouvrent, dans l'ordre. */
export function permittedTourManagerViews(
  can: (permission: StaffPermission) => boolean,
): readonly TourManagerView[] {
  return TOUR_MANAGER_VIEWS.filter((view) => view.needsAnyOf.some(can));
}

/** Le repli quand aucun onglet n'est permis : son garde redirige ailleurs. */
const FALLBACK = '/tour-manager/tournees';

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
 * `/tour-manager` ouvre le **premier onglet permis**, comme Prod manager : une
 * redirection fixe vers les tournées renverrait, par son garde, le support
 * hors de l'espace. Attend les droits (premier chargement), et garde `?jour=`.
 */
export const tourManagerLanding: RedirectFunction = async ({ queryParams }) => {
  const permissions = inject(PermissionsStore);
  const router = inject(Router);
  await permissions.ensureLoaded();
  const link =
    permittedTourManagerViews((permission) => permissions.can(permission))[0]?.link ?? FALLBACK;
  return router.createUrlTree([link], { queryParams });
};

/** Les anciennes adresses de la feuille de route (`/livraison`, favoris). */
export const toRunSheetTab = redirectKeepingQuery('/tour-manager/feuille-de-route');

/** L'ancienne adresse des tournées (`/livraison/tournees`, favoris). */
export const toRoundsTab = redirectKeepingQuery('/tour-manager/tournees');
