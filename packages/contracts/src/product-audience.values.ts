/**
 * **Les compteurs d'audience anonymes**, sans zod — ce que la boutique émet
 * (R5 bis de `documentation/recommandation-produit/plan-recommandation-de-produits.md`).
 *
 * Séparé de `product-audience.ts` pour la raison de `order-opening.values.ts` :
 * la boutique lit ces valeurs, et le baril embarquerait zod.
 *
 * 🔴 Un événement ne porte NI visiteur, NI client, NI session : un SKU, un
 * geste, un emplacement. C'est ce qui le garde sous le régime de la mesure
 * d'audience exemptée de consentement.
 */

import type { ProductAudienceSource } from "./product-audience-sources.values.js";

/** Les gestes comptés. Une VALEUR de donnée, écrite telle quelle en base. */
export const PRODUCT_AUDIENCE_EVENTS = [
  "product_viewed",
  "added_to_cart",
  "suggestion_shown",
  "suggestion_clicked",
  "suggestion_added",
] as const;

export type ProductAudienceEvent = (typeof PRODUCT_AUDIENCE_EVENTS)[number];

/** L'emplacement d'un geste qui ne vient pas d'une suggestion. */
export const NO_AUDIENCE_PLACEMENT = "none";

/** Au plus autant d'événements par lot : au-delà, le lot est refusé entier. */
export const MAX_AUDIENCE_EVENTS_PER_BATCH = 50;

/** Un geste observé par la boutique. `placement` ou `source` absent = `none`. */
export interface ProductAudienceEventInput {
  readonly sku: string;
  readonly event: ProductAudienceEvent;
  readonly placement?: string | undefined;
  readonly source?: ProductAudienceSource | undefined;
}

/** Ce que la boutique envoie : un lot, jamais un geste à la fois. */
export interface ProductAudienceBatchPayload {
  readonly events: readonly ProductAudienceEventInput[];
}

/** Un compteur relu par le staff. `day` = jour métier `YYYY-MM-DD`. */
export interface ProductAudienceCounterView {
  readonly day: string;
  readonly sku: string;
  readonly event: ProductAudienceEvent;
  readonly placement: string;
  readonly source: ProductAudienceSource;
  readonly count: number;
}
