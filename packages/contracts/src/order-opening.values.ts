import type { CustomerAudience } from "./customer-audience.js";

/**
 * **L'ouverture de la boutique à la commande**, sans zod.
 *
 * Séparé de `order-opening.ts` pour la raison de poids de
 * `delivery-availability.values.ts` : la boutique lit ces valeurs, et le baril
 * embarquerait zod dans son bundle initial. Un front les importe par
 * `@lfd/contracts/shop-values`.
 *
 * Un réglage global, posé dans « E-commerce LFC → Réglages → Ouverture de la
 * boutique » (Hugo, 2026-10-09). Fermée à une clientèle, la boutique garde son
 * catalogue et ses prix ; seules les PASSATIONS de cette clientèle sont
 * refusées. Doc : `documentation/order/ouverture-de-la-boutique.md`.
 */
export interface OrderOpeningView {
  readonly ordersOpenToB2b: boolean;
  readonly ordersOpenToB2c: boolean;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé (ouverte aux deux). */
  readonly updatedAt: string | null;
  /** Le nom de qui l'a posé, figé au geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedBy: string | null;
}

/** Ce que sert la route PUBLIQUE : les deux clientèles, sans l'instant ni l'auteur. */
export type PublicOrderOpeningView = Pick<OrderOpeningView, "ordersOpenToB2b" | "ordersOpenToB2c">;

/** Le réglage tant que personne ne l'a posé : ouverte aux deux — rien ne se ferme au déploiement. */
export const DEFAULT_ORDER_OPENING: OrderOpeningView = {
  ordersOpenToB2b: true,
  ordersOpenToB2c: true,
  updatedAt: null,
  updatedBy: null,
};

/** La boutique prend-elle les commandes de cette clientèle ? */
export function ordersOpenTo(
  settings: Pick<OrderOpeningView, "ordersOpenToB2b" | "ordersOpenToB2c">,
  audience: CustomerAudience,
): boolean {
  return audience === "b2b" ? settings.ordersOpenToB2b : settings.ordersOpenToB2c;
}

/** Le code du refus (409) quand la boutique est fermée à la clientèle de qui commande. */
export const ORDERS_CLOSED_FOR_AUDIENCE = "orders.closed_for_audience";
