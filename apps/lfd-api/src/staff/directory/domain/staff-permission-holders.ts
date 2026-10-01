import type { StaffPermission } from "@lfd/contracts";

/**
 * **Qui tient effectivement une permission** — un port de LECTURE de
 * l'annuaire, pour les blocs qui ont besoin de proposer des personnes selon ce
 * qu'elles peuvent faire (plan « Ma tournée », MT-D2 v2 : les livreurs qu'on
 * peut affecter à une tournée).
 *
 * C'est un usage de `staff` **au-delà de l'autorisation**, et il est dit comme
 * tel : la livraison ne lit pas l'annuaire, elle pose la question ici.
 *
 * L'effectif est résolu **comme le guard le résout** — rôle lu en base,
 * dérogations, fiche de secours, définition archivée ou illisible — et une
 * fiche suspendue ne tient rien. Jamais par la clé du rôle : un admin qui
 * conduit lui-même tient `delivery_driving:write` ; un livreur dont une
 * dérogation retire le droit ne le tient plus.
 */
export abstract class StaffPermissionHolders {
  /** Les fiches non suspendues qui tiennent `permission`, par nom. */
  abstract holdersOf(permission: StaffPermission): Promise<readonly StaffPermissionHolder[]>;
}

/** Une personne qui tient la permission demandée. */
export interface StaffPermissionHolder {
  readonly staffUserId: string;
  readonly firstName: string;
  readonly lastName: string;
}
