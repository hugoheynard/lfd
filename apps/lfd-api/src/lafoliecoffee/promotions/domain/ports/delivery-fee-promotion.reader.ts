import type { LivePromotion } from "../live-promotion.js";

/**
 * **Les promotions « Livraison offerte » vivantes** (`documentation/livraisons/frais-et-livraison-offerte.md`,
 * § 2.4) — un lecteur à part des lecteurs de ligne et de panier, qui filtrent
 * par point : la livraison offerte n'est ni l'un ni l'autre.
 *
 * Il rend toutes les non archivées ; ce qui admet CET acheteur dans CETTE
 * zone, à CET instant, se juge au calcul (`deliveryFeePromotionCandidates`),
 * avec le public, la fenêtre, la pause et les jours et heures.
 */
export abstract class DeliveryFeePromotionReader {
  /** Les non archivées — le présent. */
  abstract live(): Promise<readonly LivePromotion[]>;
}
