import type { OrderReviews } from "../entities/order-reviews.js";

/**
 * Port d'**écriture** du visa des commandes — il prend et rend l'agrégat
 * (§3.1). À part d'`OrderRepository` (ISP) : viser n'écrit rien de la
 * commande, seulement son registre de visas.
 */
export abstract class OrderReviewsRepository {
  /** Le registre d'une commande ; `null` : commande inconnue. */
  abstract load(orderId: string): Promise<OrderReviews | null>;

  /**
   * Écrit ce que les gestes ont changé : le visa créé, le visa retiré.
   *
   * @throws {OrderReviewRaceError} un autre visa en cours est apparu entre la
   *   lecture et l'écriture (l'index unique partiel l'a refusé).
   * @throws {OrderNotReviewedError} le visa à retirer vient d'être retiré.
   */
  abstract save(reviews: OrderReviews): Promise<void>;
}
