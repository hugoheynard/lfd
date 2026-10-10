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
  // EN TÊTE (plan-ma-tournee.md, MT-D7 v2) : le livreur n'a que ce droit, et
  // sans cette entrée le garde le laisserait passer partout, de 403 en 403.
  // Seuls le livreur et l'admin le tiennent ; l'admin, qui a tout, n'est
  // jamais redirigé.
  { permission: 'delivery_driving:read', path: '/coursier' },
  { permission: 'b2b_companies:read', path: '/commercial/comptes-clients' },
  { permission: 'b2b_growth:read', path: '/commercial' },
  { permission: 'b2b_orders:read', path: '/commandes' },
  // Une entrée par geste du fournil et du retrait (2026-10-01,
  // `documentation/livraisons/droits/plan-droits-par-geste.md`, 5.1) : sans elles, qui ne tient que le colisage
  // serait laissé passer de 403 en 403, comme le livreur avant sa ligne.
  { permission: 'production_worksheet:read', path: '/fournil' },
  { permission: 'production_plan:read', path: '/prod-manager' },
  // `/production` redirige vers Prod manager (2026-10-10) : sans cette ligne,
  // qui ne tient que les réglages du fournil serait laissé sur un 403.
  { permission: 'production_settings:read', path: '/production/reglages' },
  { permission: 'production_packing:read', path: '/colisage' },
  { permission: 'handover_counter:read', path: '/comptoir/retrait' },
  { permission: 'b2b_settings:read', path: '/reglages' },
];

/**
 * Un garde qui **dit** ce qu'il ferme.
 *
 * Une fonction de garde est opaque : rien, ni à la relecture ni au test, ne
 * distingue `permissionGuard('b2b_settings:read')` de `permissionGuard('staff_access:read')`.
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
  const guard = (): Promise<boolean | UrlTree> => admitOrRedirect([permission]);
  // La permission voyage AVEC le garde : sans ça, la table des routes ne dit
  // pas quel droit ouvre quel écran, et un garde hérité du mauvais parent est
  // indiscernable du bon (cf. `app.routes.spec.ts`).
  return Object.assign(guard, { permission });
}

/** Un garde qui laisse passer **l'un OU l'autre** des droits qu'il dit. */
export interface AnyPermissionGuard extends CanActivateFn {
  readonly anyOf: readonly StaffPermission[];
}

/**
 * Garde de route **« l'un ou l'autre »** — le pendant du `@RequireAnyPermission`
 * du serveur, pour un écran que deux métiers lisent sans que l'un reçoive la
 * ressource de l'autre (la fiche d'un bac : le colisage et le chargement,
 * 2026-10-02).
 *
 * Au moins une permission par la signature, comme côté serveur : une liste
 * vide ne dirait rien. Même redirection qu'un garde simple quand aucune ne
 * tient.
 */
export function anyPermissionGuard(
  first: StaffPermission,
  ...others: readonly StaffPermission[]
): AnyPermissionGuard {
  const anyOf = [first, ...others] as const;
  const guard = (): Promise<boolean | UrlTree> => admitOrRedirect(anyOf);
  return Object.assign(guard, { anyOf });
}

/** Laisse passer si l'une des permissions tient, sinon redirige vers la première porte ouverte. */
async function admitOrRedirect(anyOf: readonly StaffPermission[]): Promise<boolean | UrlTree> {
  const permissions = inject(PermissionsStore);
  const router = inject(Router);

  await permissions.ensureLoaded();
  if (anyOf.some((permission) => permissions.can(permission))) {
    return true;
  }
  const fallback = LANDINGS.find((landing) => permissions.can(landing.permission));
  // Aucune porte ouverte : on laisse passer et la racine dira ce qu'il en est.
  // Rediriger en rond serait pire qu'une page qui explique.
  return fallback === undefined ? true : router.parseUrl(fallback.path);
}
