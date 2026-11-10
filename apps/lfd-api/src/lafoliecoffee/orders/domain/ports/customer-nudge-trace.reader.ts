import type { CustomerNudgeTrace } from "../entities/order-customer-nudges.js";

/** Les relances d'une commande qui en a reçu au moins une. */
export interface SentCustomerNudges {
  readonly orderId: string;
  readonly pickupReminder: CustomerNudgeTrace | null;
  readonly delayWarning: CustomerNudgeTrace | null;
}

/**
 * Port de **lecture** des relances déjà faites, pour la Supervision. Séparé
 * du port d'écriture (ISP) : peindre une colonne ne verrouille rien.
 * Cross-tenant par nature — toute la journée, toutes sociétés —, gardé en
 * amont par `@AdminSurface("b2b_supervision")`.
 */
export abstract class CustomerNudgeTraceReader {
  /** Les commandes de cette date de service (`AAAA-MM-JJ`) qui ont reçu au moins une relance. */
  abstract sentOn(day: string): Promise<readonly SentCustomerNudges[]>;
}
