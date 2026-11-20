import { localToInstant, type OrderStatus } from "@lfd/contracts";

import {
  NoShowAlreadyDeclaredError,
  NoShowNoticeAlreadyRequestedError,
  NoShowNoticeRefusedError,
  NoShowRefusedError,
  NoShowTooEarlyError,
} from "../errors/order-no-show-errors.js";
import type { SettlementVenue } from "../value-objects/settlement-venue.js";

/** L'heure de fin d'un jour de retrait sans créneau : le jour entier. */
const END_OF_DAY = "23:59";

/** Qui a fait un geste, et quand. L'instant et l'auteur vont ensemble (CHECK). */
export interface NoShowTrace {
  readonly at: Date;
  /** L'id de la FICHE staff, pas une clé étrangère. */
  readonly byStaffId: string;
}

/** L'état tel que l'adaptateur le lit et l'écrit, sur la ligne de la commande. */
export interface OrderNoShowSnapshot {
  readonly orderId: string;
  readonly reference: string;
  readonly status: OrderStatus;
  readonly settlementVenue: SettlementVenue | null;
  /** La commande porte déjà un retrait (`handed_over_at`, projeté du retrait). */
  readonly handedOver: boolean;
  /** La date de retrait, `AAAA-MM-JJ` ; `null` = commande sans date. */
  readonly serviceDay: string | null;
  /** La fin du créneau convenu, `HH:MM` à Paris ; `null` = sans créneau. */
  readonly windowEnd: string | null;
  /** « Le client n'est pas venu » : posé avec le statut `no_show`. */
  readonly declared: NoShowTrace | null;
  /** « Prévenir le client » : l'e-mail DEMANDÉ, jamais attesté reçu. */
  readonly noticeRequested: NoShowTrace | null;
}

/**
 * **La commande que le client n'est pas venu retirer** — la part de la commande
 * que les gestes « Le client n'est pas venu » et « Prévenir le client » écrivent
 * (`commande-particulier-reglee-en-boutique.md`, § 5 bis).
 *
 * Ses invariants, et c'est pour eux qu'elle existe :
 *
 * - **à régler en boutique seulement** : une commande réglée chez nous a son
 *   propre sort (annulation, remboursement) ; la base le tient aussi (CHECK) ;
 * - **une commande ouverte** : ni brouillon, ni annulée, ni retirée — même en
 *   partie —, ni déjà déclarée ;
 * - **pas avant la fin du créneau de retrait** : tant qu'il court, le client
 *   peut venir. Sans créneau, la fin du jour de retrait ;
 * - **prévenir suppose la déclaration**, et ne se fait qu'une fois.
 *
 * Aucun automate : la déclaration est un geste du comptoir, qui sait qu'un
 * client en retard d'un jour vient encore chercher son pain.
 */
export class OrderNoShow {
  private constructor(private state: OrderNoShowSnapshot) {}

  static fromSnapshot(snapshot: OrderNoShowSnapshot): OrderNoShow {
    return new OrderNoShow(snapshot);
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get reference(): string {
    return this.state.reference;
  }

  /**
   * « Le client n'est pas venu ». `attestedByHandover` : le retrait — qui tient
   * la garde — atteste une remise de cette commande, lue sous le verrou de la
   * commande ; la projection sur la commande peut la suivre de peu.
   *
   * @throws {NoShowRefusedError} pas à régler en boutique, ou pas ouverte.
   * @throws {NoShowAlreadyDeclaredError} @throws {NoShowTooEarlyError}
   */
  declare(at: Date, byStaffId: string, attestedByHandover: boolean): void {
    this.assertDeclarable(attestedByHandover);
    const slotEnd = this.slotEnd();
    if (at.getTime() < slotEnd.getTime()) {
      throw new NoShowTooEarlyError(this.reference, slotEnd);
    }
    this.state = { ...this.state, status: "no_show", declared: { at, byStaffId } };
  }

  /**
   * « Prévenir le client » : l'e-mail « commande non retirée » est demandé.
   *
   * @throws {NoShowNoticeRefusedError} la commande n'est pas déclarée non retirée.
   * @throws {NoShowNoticeAlreadyRequestedError}
   */
  requestNotice(at: Date, byStaffId: string): void {
    if (this.state.status !== "no_show") {
      throw new NoShowNoticeRefusedError(
        `La commande ${this.reference} n'est pas déclarée non retirée : il n'y a rien à annoncer au client. Déclarez d'abord « Le client n'est pas venu », après la fin du créneau.`,
      );
    }
    if (this.state.noticeRequested !== null) {
      throw new NoShowNoticeAlreadyRequestedError(this.reference);
    }
    this.state = { ...this.state, noticeRequested: { at, byStaffId } };
  }

  toSnapshot(): OrderNoShowSnapshot {
    return this.state;
  }

  private assertDeclarable(attestedByHandover: boolean): void {
    const { reference, status, settlementVenue } = this.state;
    const handedOver = this.state.handedOver || attestedByHandover;
    if (status === "no_show") {
      throw new NoShowAlreadyDeclaredError(reference);
    }
    if (settlementVenue !== "shop_till") {
      throw new NoShowRefusedError(
        `La commande ${reference} ne se règle pas à la caisse de la boutique : « Le client n'est pas venu » ne vaut que pour ces commandes. Pour une autre commande, voyez l'annulation.`,
      );
    }
    if (status === "cancelled") {
      throw new NoShowRefusedError(
        `La commande ${reference} est annulée : il n'y a rien à déclarer.`,
      );
    }
    if (status === "fulfilled" || status === "partially_handed_over" || handedOver) {
      throw new NoShowRefusedError(
        `La commande ${reference} a déjà été retirée : le client est venu, elle ne se déclare pas non retirée.`,
      );
    }
    if (status === "draft") {
      throw new NoShowRefusedError(
        `La commande ${reference} n'a pas été passée : il n'y a rien à déclarer.`,
      );
    }
  }

  /** La fin du créneau ; sans créneau, la fin du jour de retrait. */
  private slotEnd(): Date {
    const { serviceDay, windowEnd, reference } = this.state;
    const end = serviceDay === null ? null : localToInstant(serviceDay, windowEnd ?? END_OF_DAY);
    if (end === null) {
      throw new NoShowRefusedError(
        `La commande ${reference} n'a pas de jour de retrait lisible : impossible de dire si son créneau est passé. Ouvrez la commande pour vérifier son créneau.`,
      );
    }
    return end;
  }
}
