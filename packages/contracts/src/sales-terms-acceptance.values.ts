import type { SalesTermsDocument } from "./platform-content.defaults.js";

/**
 * **Les CGV que le client a lues et cochées au panier** (demande de Hugo du
 * 2026-10-26 ; plan `documentation/legal/plan-cgv-par-audience.md`, C6) — le
 * texte et sa révision, tels que la boutique les a reçus avec ce qu'elle a
 * affiché.
 *
 * `null` dit « il n'y avait rien à cocher » : aucune révision publiée pour
 * l'audience de la commande (C1′, « en cours de rédaction »). Le serveur le
 * confronte à ce qui est en vigueur ; il n'en tire jamais la version qu'il
 * fige — celle-là, il la résout lui-même.
 */
export interface AcceptedSalesTerms {
  readonly key: SalesTermsDocument;
  readonly revision: number;
}

/**
 * Le code du refus (409) quand les CGV acceptées ne sont plus celles en
 * vigueur pour l'audience de la commande : la boutique recharge le texte,
 * décoche, et le client relit.
 */
export const SALES_TERMS_OUTDATED = "orders.sales_terms_outdated";

/** Le message du refus de forme (400) d'une passation qui n'a pas coché. */
export const SALES_TERMS_REQUIRED_MESSAGE =
  "Vous devez accepter les conditions générales de vente.";
