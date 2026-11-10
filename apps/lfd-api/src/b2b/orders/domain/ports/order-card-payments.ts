import type {
  CardPaymentCancellation,
  CardPaymentLine,
  RetrievedCardPayment,
} from "../../../../card-payment/channels/requests/index.js";

/**
 * **Les gestes du commerce sur le premier paiement d'une commande** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §4.2, §4.6), par les ports du bloc `card-payment` — trois ports étroits
 * (ISP), un par famille de consommateurs, implémentés ensemble par
 * `OrderCardPayments`.
 *
 * 🔴 Une commande d'avant le bloc n'a pas de ligne de paiement : les
 * COMMANDES l'adoptent ({@link OrderCardCancellation},
 * {@link OrderCardAdoption}) ; une LECTURE ne l'adopte jamais
 * ({@link OrderCardRetrieval}).
 */

/** Annuler l'intention : abandon, expiration, clôture, annulation. */
export abstract class OrderCardCancellation {
  /**
   * Adopte au besoin, puis annule chez le prestataire. 🔴 HORS transaction.
   * Ne lève jamais : un échec rend `unavailable` et sa raison.
   */
  abstract cancelFirst(orderId: string): Promise<CardPaymentCancellation>;
}

/** Relire l'intention pour la régler : la page de règlement, le rejeu de la passation. */
export abstract class OrderCardRetrieval {
  /**
   * 🔴 HORS transaction ; n'écrit rien.
   * @throws {OrderPaymentAwaitsAdoptionError} intention sans ligne de paiement.
   */
  abstract retrieveFirst(orderId: string): Promise<RetrievedCardPayment>;
}

/** Le premier paiement, adopté s'il manque : l'exécuteur des remboursements, l'adoption. */
export abstract class OrderCardAdoption {
  /**
   * Dans la transaction de l'appelant (ou la sienne). `null` : la commande ne
   * porte aucune intention.
   */
  abstract ensureFirst(orderId: string): Promise<CardPaymentLine | null>;
}
