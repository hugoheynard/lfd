/**
 * Les deux droits du transfert du catalogue (`plan-droit-lfc-catalog.md`).
 * L'aperçu qui les lit survit au lot L2 (2026-10-16) : il dit encore qui porte
 * l'ancien droit, retiré à la résolution mais pas effacé de la base.
 */

/** Le droit qui part : retiré depuis le lot L2, il ne garde plus aucune route. */
export const LEGACY_CATALOG_RESOURCE = "b2b_catalog";
/** Le droit qui arrive (C1). */
export const CATALOG_RESOURCE = "lfc_catalog";

export type CatalogRightResource = typeof LEGACY_CATALOG_RESOURCE | typeof CATALOG_RESOURCE;
