/**
 * Les sources d'une mesure d'audience, hors de `product-audience.values.ts`.
 *
 * Module à part pour le paquet initial de la boutique (à ~120 o de son
 * plafond le 2026-10-18) : `shop-values` réexporte les valeurs voisines, et
 * le découpeur rangeait ce tableau dans un morceau initial partagé. La
 * boutique n'en lit que le TYPE.
 */

/**
 * **D'où vient une suggestion** (§2 bis du plan, Hugo, 2026-10-18) : `data`
 * pour un calcul, `staff` pour un conseil décidé, `none` pour une vue ou un
 * ajout qui ne vient d'aucune suggestion. Une VALEUR de donnée, dans la clé
 * du compteur : c'est ce qui compare ce que convertissent les deux sources.
 */
export const PRODUCT_AUDIENCE_SOURCES = ["none", "data", "staff"] as const;

export type ProductAudienceSource = (typeof PRODUCT_AUDIENCE_SOURCES)[number];

/** La source d'un geste qui ne vient pas d'une suggestion. */
export const NO_AUDIENCE_SOURCE = "none";
