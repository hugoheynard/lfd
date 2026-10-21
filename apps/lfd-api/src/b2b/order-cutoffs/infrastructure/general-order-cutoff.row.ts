/**
 * Le `where` de la règle générale : ni point, ni jour. La base n'en admet plus
 * d'autre depuis la migration du 2026-10-21 (CHECK `order_cutoffs_general_only`) ;
 * le filtre reste, pour qu'une base pas encore migrée ne rende jamais une
 * ligne à point ou à jour comme si elle était la générale.
 */
export const GENERAL_ORDER_CUTOFF_WHERE = { pickupAddressId: null, weekday: null } as const;
