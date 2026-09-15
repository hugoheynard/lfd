import type { CustomerAudience } from "./customer-audience.js";

/**
 * **Les valeurs de la disponibilité de la livraison**, sans zod.
 *
 * ⚠️ Séparées de `delivery-availability.ts` pour une raison de POIDS, comme
 * `feature-access.levels.ts` : la boutique les lit dès le démarrage (le magasin
 * des points de service, le contexte de commande, le devis), et les prendre au
 * baril embarquait zod et tous les schémas dans son bundle initial — 1,52 Mo
 * pour un budget d'erreur de 1,30 Mo en configuration `cloudflare`, déploiement
 * de la boutique échoué le 2026-09-15 (run `35024864106`).
 *
 * `delivery-availability.ts` les réexporte : le backend et le baril n'y voient
 * aucune différence. Un front les importe par `@lfd/contracts/shop-values`.
 */

/**
 * Contrat de fil du **réglage de livraison** : à quelles clientèles la livraison
 * est proposée. Un réglage global, posé dans « E-commerce LFC → Réglages →
 * Livraison ». Cf. `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4.
 */
export interface DeliveryAvailabilityView {
  readonly openToB2b: boolean;
  readonly openToB2c: boolean;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé (ouvert aux deux). */
  readonly updatedAt: string | null;
  /** Le nom de qui l'a posé, figé au geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedBy: string | null;
}

/**
 * Ce que la route **publique** sert : les deux clientèles, sans l'instant ni
 * l'auteur. Le nom d'un agent du back-office n'a rien à faire devant un
 * visiteur anonyme ; la vue complète reste celle de l'admin.
 */
export type PublicDeliveryAvailabilityView = Pick<
  DeliveryAvailabilityView,
  "openToB2b" | "openToB2c"
>;

/** Ce que vaut le réglage tant que personne ne l'a posé : l'existant, ouvert aux deux. */
export const DEFAULT_DELIVERY_AVAILABILITY: DeliveryAvailabilityView = {
  openToB2b: true,
  openToB2c: true,
  updatedAt: null,
  updatedBy: null,
};

/** La livraison est-elle proposée à cette clientèle ? */
export function deliveryOpenTo(
  settings: Pick<DeliveryAvailabilityView, "openToB2b" | "openToB2c">,
  audience: CustomerAudience,
): boolean {
  return audience === "b2b" ? settings.openToB2b : settings.openToB2c;
}

/**
 * Le code du refus quand la livraison est fermée à la clientèle (409). Partagé :
 * la boutique le reconnaît pour montrer le refus au lieu de garder un ancien
 * décompte.
 */
export const DELIVERY_CLOSED_FOR_AUDIENCE = "orders.delivery.closed_for_audience";
