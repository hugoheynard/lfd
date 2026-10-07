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
 * **Créneau ou échéance** — la façon dont une livraison se demande (plan
 * composition automatique, CA-D2). `slot` : un début et une fin ; `deadline` :
 * une heure limite seule, la fenêtre demandée n'a pas de début.
 */
export const WINDOW_MODES = ["slot", "deadline"] as const;
export type WindowMode = (typeof WINDOW_MODES)[number];

/**
 * Le mode qui s'applique à une livraison : celui de l'adresse s'il est posé,
 * sinon le réglage global. `null`/absent = l'adresse hérite — même motif que
 * `stopMinutes` et la signature.
 */
export function resolveWindowMode(
  addressMode: WindowMode | null | undefined,
  globalMode: WindowMode,
): WindowMode {
  return addressMode ?? globalMode;
}

/**
 * Contrat de fil du **réglage de livraison** : à quelles clientèles la livraison
 * est proposée. Un réglage global, posé dans « E-commerce LFC → Réglages →
 * Livraison ». Cf. `documentation/livraisons/clientele/plan-remise-et-livraison-par-clientele.md`, D4.
 */
export interface DeliveryAvailabilityView {
  readonly openToB2b: boolean;
  readonly openToB2c: boolean;
  /**
   * Comment une livraison se demande par défaut — créneau ou échéance (CA-D2).
   * Une adresse peut le surcharger (`DeliverySpecs.windowMode`).
   */
  readonly windowMode: WindowMode;
  /**
   * **Marge de livraison**, en minutes : colisage + chargement, retranchée de
   * l'échéance d'une livraison pour dire au fournil avant quelle heure sortir
   * (plan production par vagues, §7.3). `null` = non réglée — aucune valeur
   * n'est inventée. Toujours servie depuis le 2026-10-04 ; facultative au TYPE
   * pour qu'un front qui construit sa propre vue compile encore.
   */
  readonly deliveryMarginMinutes?: number | null | undefined;
  /** **Marge de retrait**, en minutes : colisage seul. Même contrat que la précédente. */
  readonly pickupMarginMinutes?: number | null | undefined;
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
> & {
  /**
   * Toujours servi depuis le 2026-10-03 (CA-D2) ; facultatif au TYPE pour
   * qu'un front qui pose son propre défaut sans lui compile encore.
   */
  readonly windowMode?: WindowMode | undefined;
};

/** Ce que vaut le réglage tant que personne ne l'a posé : ouvert aux deux, en échéance (§14.2, Hugo 2026-10-04). */
export const DEFAULT_DELIVERY_AVAILABILITY: DeliveryAvailabilityView = {
  openToB2b: true,
  openToB2c: true,
  windowMode: "deadline",
  deliveryMarginMinutes: null,
  pickupMarginMinutes: null,
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
