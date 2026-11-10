import { localToInstant, type FulfillmentMethod, type OrderStatus } from "@lfd/contracts";

import {
  DelayWarningAlreadySentError,
  DelayWarningRefusedError,
  DelayWarningTooEarlyError,
  PickupReminderAlreadySentError,
  PickupReminderTooEarlyError,
} from "../errors/customer-nudge-errors.js";
import { ReminderRefusedError } from "../errors/order-errors.js";

const MINUTE_MS = 60_000;

/** Le refus propre au geste : chaque relance a sa catégorie et son code. */
type Refusal = (reason: string) => Error;

/** Qui a fait une relance, et quand. L'instant et l'auteur vont ensemble (CHECK). */
export interface CustomerNudgeTrace {
  readonly at: Date;
  /** L'id de la FICHE staff, pas une clé étrangère. */
  readonly byStaffId: string;
}

/** L'état tel que l'adaptateur le lit et l'écrit, sur la ligne de la commande. */
export interface OrderCustomerNudgesSnapshot {
  readonly orderId: string;
  readonly reference: string;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly status: OrderStatus;
  readonly readyAt: Date | null;
  readonly handedOverAt: Date | null;
  /** La date de service, `AAAA-MM-JJ` ; `null` = commande sans date. */
  readonly serviceDay: string | null;
  /** La fin du créneau convenu, `HH:MM` à Paris ; `null` = sans créneau. */
  readonly windowEnd: string | null;
  readonly pickupReminder: CustomerNudgeTrace | null;
  readonly delayWarning: CustomerNudgeTrace | null;
}

/**
 * **Les deux relances d'un retrait en retard** (Hugo, 2026-10-25) — la part
 * de la commande que les gestes « Rappel au client » et « Avertir le client »
 * de la Supervision écrivent.
 *
 * Ses invariants, et c'est pour eux qu'elle existe :
 *
 * - **qui est en retard décide du geste** : le rappel suppose la commande
 *   prête (le client n'est pas venu), l'avertissement la suppose pas prête
 *   (c'est nous). Les deux ne sont jamais possibles au même instant ;
 * - **une fois chacune par commande** : la trace refuse le second envoi ;
 * - **pas avant le délai réglé après la FIN DU CRÉNEAU** — un retrait porte
 *   toujours un créneau (CHECK `orders_pickup_has_window`) ;
 * - **un retrait ouvert seulement** : ni livraison, ni brouillon, ni annulée,
 *   ni déjà retirée.
 */
export class OrderCustomerNudges {
  private constructor(private state: OrderCustomerNudgesSnapshot) {}

  static fromSnapshot(snapshot: OrderCustomerNudgesSnapshot): OrderCustomerNudges {
    return new OrderCustomerNudges(snapshot);
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get reference(): string {
    return this.state.reference;
  }

  /**
   * « Rappel au client » : la commande prête l'attend, il n'est pas venu.
   *
   * @throws {ReminderRefusedError} pas un retrait ouvert, ou pas encore prête.
   * @throws {PickupReminderAlreadySentError} @throws {PickupReminderTooEarlyError}
   */
  remindPickup(at: Date, byStaffId: string, delayMinutes: number): void {
    const refuse = (reason: string): Error => new ReminderRefusedError(reason);
    this.assertOpenPickup(refuse);
    if (!this.isReady()) {
      throw new ReminderRefusedError(
        `La commande ${this.reference} n'est pas encore prête : un rappel ferait venir le client pour rien. Utilisez « Avertir le client » pour le prévenir du retard.`,
      );
    }
    if (this.state.pickupReminder !== null) {
      throw new PickupReminderAlreadySentError(this.reference);
    }
    const availableAt = this.availableAt(delayMinutes, refuse);
    if (at.getTime() < availableAt.getTime()) {
      throw new PickupReminderTooEarlyError(this.reference, availableAt);
    }
    this.state = { ...this.state, pickupReminder: { at, byStaffId } };
  }

  /**
   * « Avertir le client » : le créneau est passé, la commande n'est pas prête.
   *
   * @throws {DelayWarningRefusedError} pas un retrait ouvert, ou déjà prête.
   * @throws {DelayWarningAlreadySentError} @throws {DelayWarningTooEarlyError}
   */
  warnDelay(at: Date, byStaffId: string, delayMinutes: number): void {
    const refuse = (reason: string): Error => new DelayWarningRefusedError(reason);
    this.assertOpenPickup(refuse);
    if (this.isReady()) {
      throw new DelayWarningRefusedError(
        `La commande ${this.reference} est déjà prête : le client a reçu le courriel « prête ». S'il ne vient pas, utilisez « Rappel au client ».`,
      );
    }
    if (this.state.delayWarning !== null) {
      throw new DelayWarningAlreadySentError(this.reference);
    }
    const availableAt = this.availableAt(delayMinutes, refuse);
    if (at.getTime() < availableAt.getTime()) {
      throw new DelayWarningTooEarlyError(this.reference, availableAt);
    }
    this.state = { ...this.state, delayWarning: { at, byStaffId } };
  }

  toSnapshot(): OrderCustomerNudgesSnapshot {
    return this.state;
  }

  private isReady(): boolean {
    return this.state.readyAt !== null || this.state.status === "ready";
  }

  /** La fin du créneau, plus le délai réglé. */
  private availableAt(delayMinutes: number, refuse: Refusal): Date {
    return new Date(this.slotEnd(refuse).getTime() + delayMinutes * MINUTE_MS);
  }

  /** Un retrait ouvert, avec un créneau lisible — sinon la phrase du refus. */
  private assertOpenPickup(refuse: Refusal): void {
    const { reference, fulfillmentMethod, status, handedOverAt } = this.state;
    if (fulfillmentMethod !== "pickup") {
      throw refuse(
        `La commande ${reference} est une livraison : les relances ne visent que le retrait.`,
      );
    }
    if (status === "cancelled") {
      throw refuse(`La commande ${reference} est annulée : il n'y a rien à relancer.`);
    }
    if (status === "fulfilled" || handedOverAt !== null) {
      throw refuse(`La commande ${reference} est déjà retirée : il n'y a rien à relancer.`);
    }
    if (status === "draft") {
      throw refuse(`La commande ${reference} n'a pas été passée : il n'y a rien à relancer.`);
    }
    this.slotEnd(refuse);
  }

  /**
   * L'instant de la fin du créneau. Un retrait passé en porte toujours un
   * (CHECK `orders_pickup_has_window`) : son absence est une donnée cassée,
   * pas un cas à juger, et elle est refusée sans rien envoyer.
   */
  private slotEnd(refuse: Refusal): Date {
    const { serviceDay, windowEnd, reference } = this.state;
    const end =
      serviceDay === null || windowEnd === null ? null : localToInstant(serviceDay, windowEnd);
    if (end === null) {
      throw refuse(
        `La commande ${reference} n'a pas de créneau lisible : impossible de dire si elle est en retard. Ouvrez la commande pour vérifier son créneau.`,
      );
    }
    return end;
  }
}
