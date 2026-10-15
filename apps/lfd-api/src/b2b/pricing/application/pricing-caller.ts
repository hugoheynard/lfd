/**
 * **Qui demande un prix** — l'étiquette `caller` de la sonde `pricing.resolve`
 * (`documentation/ops/sonde-calcul-des-prix.md`).
 *
 * Obligatoire sur chaque lot : une étiquette par défaut rangerait en silence
 * un appelant neuf sous le nom d'un autre, et la carte mentirait sur qui coûte.
 *
 * - `shelf` : le rayon (vitrine publique et rayon reconnu) ;
 * - `cart` : le panier et son devis ;
 * - `checkout` : la passation — client, boutique ou saisie de l'équipe ;
 * - `back-office` : les écrans de tarification (projection).
 */
export type PricingCaller = "shelf" | "cart" | "checkout" | "back-office";

/** Le nom de la mesure, lu tel quel par la carte de santé. */
export const PRICING_RESOLVE_TIMING = "pricing.resolve";
