/** Un bon au compte dont la remise n'est pas constatée, son jour passé. */
export interface UnconfirmedDelivery {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly companyId: string;
  readonly companyName: string;
  /** `AAAA-MM-JJ` — le jour de retrait ou de livraison demandé. */
  readonly serviceDay: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly totalCents: number;
  /** La passation — ce qui choisit le payeur d'un site (`billedPayerOf`). */
  readonly placedAt: Date;
  /** Le payeur figé sur le bon ; `null` : celui que suit le site à la passation. */
  readonly billedCompanyId: string | null;
  /** Remise en partie, pas soldée (E6c2) : « en attente du reste ». */
  readonly awaitingRemainder: boolean;
}

/**
 * **Les bons à constater** (lot ZL) — lecture seule. Ce sont les bons que
 * l'assiette de la facture n'a pas encore le droit de prendre (pas de
 * `settled_on`) alors que leur jour est passé : ni facturés, ni prélevés
 * tant que personne n'a constaté leur remise — ou ne les a annulés.
 */
export abstract class UnconfirmedDeliveriesReader {
  /**
   * Les bons au compte, non annulés, pas soldés (`settled_on` nul), dont le jour
   * demandé est STRICTEMENT antérieur à `day` — du plus ancien au plus récent.
   *
   * @param day `AAAA-MM-JJ`, aujourd'hui à Paris.
   */
  abstract servedBefore(day: string): Promise<readonly UnconfirmedDelivery[]>;
}
