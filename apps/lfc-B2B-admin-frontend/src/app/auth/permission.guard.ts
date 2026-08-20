import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from './permissions.store';

/**
 * Les destinations de premier niveau, dans l'ordre où on les propose à quelqu'un
 * qui arrive sur une page qui lui est fermée. L'ordre est celui du menu : on
 * renvoie vers la première porte ouverte, pas vers une page d'erreur.
 */
const LANDINGS: readonly { readonly permission: StaffPermission; readonly path: string }[] = [
  { permission: 'companies:read', path: '/commercial/comptes-clients' },
  { permission: 'growth:read', path: '/commercial' },
  { permission: 'orders:read', path: '/commandes' },
  { permission: 'settings:read', path: '/reglages' },
];

/**
 * Un garde qui **dit** ce qu'il ferme.
 *
 * Une fonction de garde est opaque : rien, ni à la relecture ni au test, ne
 * distingue `permissionGuard('settings:read')` de `permissionGuard('staff:read')`.
 * Porter la permission sur la fonction rend la table des routes inspectable —
 * c'est ce qui permet de vérifier que chaque écran est derrière le **bon** droit,
 * et pas seulement derrière un droit quelconque.
 */
export interface PermissionGuard extends CanActivateFn {
  readonly permission: StaffPermission;
}

/**
 * Garde de route : cette personne peut-elle voir cet écran ?
 *
 * **Le front cache, le serveur refuse.** Ce garde n'est pas un mur — il évite
 * d'ouvrir une page dont chaque appel rendrait `403`, ce qui ressemblerait à
 * une panne. Le vrai refus vient de `StaffAccessGuard`, côté backend.
 *
 * Refusée, la navigation est **redirigée** vers la première destination
 * autorisée plutôt que bloquée : renvoyer `false` laisse l'utilisateur sur une
 * page vide, sans rien lui dire de ce qu'il peut faire à la place.
 */
export function permissionGuard(permission: StaffPermission): PermissionGuard {
  const guard = async (): Promise<boolean | UrlTree> => {
    const permissions = inject(PermissionsStore);
    const router = inject(Router);

    await permissions.ensureLoaded();
    if (permissions.can(permission)) {
      return true;
    }
    const fallback = LANDINGS.find((landing) => permissions.can(landing.permission));
    // Aucune porte ouverte : on laisse passer et la racine dira ce qu'il en est.
    // Rediriger en rond serait pire qu'une page qui explique.
    return fallback === undefined ? true : router.parseUrl(fallback.path);
  };
  // La permission voyage AVEC le garde : sans ça, la table des routes ne dit
  // pas quel droit ouvre quel écran, et un garde hérité du mauvais parent est
  // indiscernable du bon (cf. `app.routes.spec.ts`).
  return Object.assign(guard, { permission });
}
