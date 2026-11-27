/**
 * **Le canal des paniers récurrents vers le commerce** — le seul point
 * d'entrée du bloc `recurring` pour un autre bloc (plan
 * `plan-bloc-recurrent.md`, § 6).
 *
 * Ce que le bloc demande (déclaré ici, implémenté par le commerce) :
 */
export {
  OccurrencePlacement,
  type OccurrencePlacementOutcome,
  type OccurrencePlacementRequest,
  type OccurrenceRefusalCause,
  type PlacementSalesTerms,
} from "./occurrence-placement.js";
export { BasketBuyerStanding, type BasketCompanyMember } from "./basket-buyer-standing.js";
export { BasketArticles, type BasketArticlesReview } from "./basket-articles.js";
export { BasketPickupPoints } from "./basket-pickup-points.js";
export { BasketSalesTerms, type SalesTermsInForce } from "./basket-sales-terms.js";
export { BasketBuyerContacts } from "./basket-buyer-contacts.js";
export {
  PlannedBasketCheck,
  type PlannedBasketCheckItem,
  type PlannedBasketCheckRequest,
  type PlannedLineBlocking,
  type PlannedLineCheck,
} from "./planned-basket-check.js";
export { PlannerFavoriteSkus } from "./planner-favorite-skus.js";
export {
  PlannedColumnPlacement,
  type PlannedColumnPlacementOutcome,
  type PlannedColumnPlacementRequest,
} from "./planned-column-placement.js";
/**
 * Ce que le bloc écoute (déclaré ici, émis par le contenu du commerce au
 * dépôt du PDF des CGV, § 7) :
 */
export {
  CONTENT_SALES_TERMS_PUBLISHED,
  SalesTermsPublishedFact,
  SalesTermsPublishedPayloadError,
} from "./sales-terms-published.js";
/**
 * Ce que le bloc émet (faits durables, § 6.2) : les gestes du client sur son
 * panier, et l'issue de chaque échéance. Les faits du JOURNAL gardent leurs
 * types `subscription.*` ; ceux-ci vivent dans la boîte d'envoi.
 */
export {
  type BasketFactSite,
  RECURRING_BASKET_OCCURRENCE_CHANGED,
  RECURRING_BASKET_OPENED,
  RECURRING_BASKET_PAUSED,
  RECURRING_BASKET_RESUMED,
  RECURRING_BASKET_STOPPED,
  RecurringBasketFact,
  RecurringBasketFactPayloadError,
  type RecurringBasketFactType,
} from "./basket-facts.js";
export {
  RECURRING_OCCURRENCE_MISSED,
  RECURRING_OCCURRENCE_PLACED,
  RECURRING_OCCURRENCE_REFUSED,
  RecurringOccurrenceFact,
  RecurringOccurrenceFactPayloadError,
  type RecurringOccurrenceFactType,
  type RecurringOccurrenceOutcome,
} from "./occurrence-facts.js";
/** Ce que le bloc sait répondre (déclaré et implémenté par lui) : */
export { RecurringBasketCounts } from "./recurring-basket-counts.js";
export { RecurringSkuUsage } from "./recurring-sku-usage.js";
