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
 * - `back-office` : les écrans de tarification (projection) ;
 * - `suggestions` : les articles suggérés (habitudes, suggestions du staff,
 *   « souvent pris avec ») — quelques articles du rayon, tarifés seuls
 *   depuis le 2026-11-02 ; avant, ils comptaient sous `shelf`, rayon entier.
 */
export type PricingCaller = "shelf" | "cart" | "checkout" | "back-office" | "suggestions";

/** Le nom de la mesure, lu tel quel par la carte de santé. */
export const PRICING_RESOLVE_TIMING = "pricing.resolve";
