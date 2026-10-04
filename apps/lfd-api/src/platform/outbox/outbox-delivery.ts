import { OutboxDeliveryAlreadyDeliveredError } from "./outbox-errors.js";

/** L'état persistant d'une livraison message × abonné. */
export interface OutboxDeliveryState {
  readonly eventId: string;
  readonly subscriber: string;
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly claimedUntil: Date | null;
  readonly deliveredAt: Date | null;
  readonly lastError: string | null;
}

/**
 * **Une livraison d'un fait à un abonné** — l'agrégat du rejeu manuel (§8).
 *
 * Le relais, lui, n'en charge pas : ses écritures sont des projections
 * conditionnées en base (`delivered_at IS NULL`), atomiques, comme
 * `OrderRepository.markPaid` — une load→save y perdrait l'atomicité pour zéro
 * invariant de plus. Le rejeu, lui, a une règle qui refuse : on ne rejoue pas
 * ce qui est livré.
 */
export class OutboxDelivery {
  private constructor(private state: OutboxDeliveryState) {}

  static rehydrate(state: OutboxDeliveryState): OutboxDelivery {
    return new OutboxDelivery(state);
  }

  /**
   * Remet les essais à zéro et rend la livraison due tout de suite. La
   * dernière erreur est gardée : c'est le seul témoin de ce qui a bloqué.
   *
   * @throws {OutboxDeliveryAlreadyDeliveredError} déjà livrée.
   */
  replay(now: Date): void {
    if (this.state.deliveredAt !== null) {
      throw new OutboxDeliveryAlreadyDeliveredError(this.state.eventId, this.state.subscriber);
    }
    this.state = { ...this.state, attempts: 0, nextAttemptAt: now, claimedUntil: null };
  }

  toState(): OutboxDeliveryState {
    return this.state;
  }
}
