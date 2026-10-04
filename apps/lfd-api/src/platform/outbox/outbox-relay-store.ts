/** Une livraison réservée par le relais, avec le fait qu'elle porte. */
export interface ClaimedDelivery {
  readonly eventId: string;
  readonly subscriber: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempts: number;
}

/** Ce que le relais demande pour réserver. */
export interface ClaimRequest {
  readonly now: Date;
  readonly leaseUntil: Date;
  readonly limit: number;
  readonly maxAttempts: number;
}

/**
 * Port du **relais** : réserver, accuser réception, noter un échec.
 *
 * Écritures ciblées et conditionnées en base, assumées comme telles : ce sont
 * des projections atomiques (cf. `OutboxDelivery`).
 */
export abstract class OutboxRelayStore {
  /**
   * Réserve des livraisons dues, non livrées, non réservées (ou au bail
   * expiré), sous `FOR UPDATE SKIP LOCKED` : deux relais ne réservent pas la
   * même. Courte transaction à elle seule.
   */
  abstract claim(request: ClaimRequest): Promise<readonly ClaimedDelivery[]>;

  /**
   * Le **reçu** : pose `delivered_at` si la livraison ne l'est pas encore. À
   * appeler dans la transaction de l'effet. Rend `false` si elle l'était déjà
   * — l'abonné ne doit alors pas être appelé.
   */
  abstract acknowledge(eventId: string, subscriber: string, at: Date): Promise<boolean>;

  /** Note un échec : essais, prochain essai, erreur ; libère le bail. */
  abstract recordFailure(failure: DeliveryFailure): Promise<void>;
}

export interface DeliveryFailure {
  readonly eventId: string;
  readonly subscriber: string;
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly error: string;
}
