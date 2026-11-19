import { hasStaffPermission, type StaffPermission } from "@lfd/contracts";

/**
 * **Le droit de passer outre la limite d'un produit**, lu dans les permissions
 * que la porte staff a résolues en base (`@StaffPermissions()`) : le corps de
 * la requête ne peut pas le forger. La saisie, son estimation et l'avis du
 * comptoir le passent en booléen à leur commande ou requête.
 */
export function mayExceedItemLimits(permissions: readonly StaffPermission[]): boolean {
  return hasStaffPermission(permissions, "lfc_product_limit_override:write");
}

/** Le droit de lire les dépassements consignés sur une commande. */
export function mayReadItemLimitOverrides(permissions: readonly StaffPermission[]): boolean {
  return hasStaffPermission(permissions, "lfc_product_limit_override:read");
}
