/**
 * Les deux droits du transfert du catalogue (`plan-droit-lfc-catalog.md`).
 * Ils disparaîtront avec le lot L2 de ce plan, quand `b2b_catalog` sera
 * retiré à la résolution.
 */

/** Le droit qui part : il garde les routes du catalogue jusqu'au lot L2. */
export const LEGACY_CATALOG_RESOURCE = "b2b_catalog";
/** Le droit qui arrive (C1). */
export const CATALOG_RESOURCE = "lfc_catalog";

export type CatalogRightResource = typeof LEGACY_CATALOG_RESOURCE | typeof CATALOG_RESOURCE;
