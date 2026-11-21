import {
  ORDER_REVIEW_NOTE_MAX_LENGTH,
  type OrderClientele,
  type OrderStatus,
} from "@lfd/contracts";

import {
  OrderAlreadyReviewedError,
  OrderNotReviewedError,
  OrderReviewNoteTooLongError,
  OrderReviewOutOfScopeError,
} from "../errors/order-review-errors.js";
import { ORDER_REVIEW_STARTS_AT } from "../services/order-review-start.js";

/** Ce que le visa lit de la commande pour décider si elle se vise. */
export interface ReviewedOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** Le client qui l'a passée : le sujet des faits du visa au journal. */
  readonly placedByUserId: string;
  /** `null` : commande sans société. */
  readonly companyId: string | null;
  /** Non nul : saisie par l'équipe (le critère d'`orderOriginOf`). */
  readonly placedByStaffId: string | null;
  /** `null` : commande d'avant la distinction pro / particulier. */
  readonly clientele: OrderClientele | null;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  /** La révision courante de la commande (`orders.revision`). */
  readonly revision: number;
}

/** Qui a retiré un visa, et quand — les deux ensemble (CHECK). */
export interface OrderReviewWithdrawal {
  readonly byStaffId: string;
  readonly at: Date;
}

/** Un visa, en cours (`withdrawn` nul) ou retiré. */
export interface OrderReviewRecord {
  readonly id: string;
  /** La révision de la commande que le visa a vue. */
  readonly reviewedRevision: number;
  readonly reviewedByStaffId: string;
  readonly reviewedAt: Date;
  /** Nulle, ou un texte non vide (CHECK). */
  readonly note: string | null;
  readonly withdrawn: OrderReviewWithdrawal | null;
}

/** Ce que l'adaptateur doit écrire après un geste. */
export interface OrderReviewChanges {
  /** Un visa neuf, à insérer. */
  readonly created: OrderReviewRecord | null;
  /** Un visa retiré, dont les colonnes `withdrawn_*` sont à poser. */
  readonly withdrawn: OrderReviewRecord | null;
}

/** Les statuts d'une commande qui n'est pas (ou plus) à vérifier. */
const CLOSED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["draft", "cancelled"]);

/**
 * **Le registre des visas d'UNE commande** (plan du visa des commandes, V2).
 *
 * Ses invariants, et c'est pour eux qu'il existe :
 *
 * - **le périmètre** : on ne vise qu'une commande passée par un client pro
 *   lui-même (`placed_by_staff_id` nul, abonnements compris), ni brouillon ni
 *   annulée — une tentative abandonnée est annulée —, passée après
 *   {@link ORDER_REVIEW_STARTS_AT} ;
 * - **un seul visa en cours** : viser une commande déjà visée est refusé ;
 *   révisée depuis son visa, la viser REMPLACE l'ancien visa (retiré au nom
 *   de qui vise, au même instant), en un seul geste ;
 * - **retirer suppose un visa en cours** ; n'importe quel porteur du droit le
 *   retire, pas seulement son auteur ;
 * - **rien ne s'efface** : retirer garde qui et quand, viser à nouveau crée
 *   un visa de plus.
 *
 * L'index unique partiel de la base reste le dernier gardien d'une course
 * entre deux commerciaux qui auraient chargé le même registre.
 */
export class OrderReviews {
  private created: OrderReviewRecord | null = null;
  private withdrawnNow: OrderReviewRecord | null = null;

  private constructor(
    readonly order: ReviewedOrder,
    private records: readonly OrderReviewRecord[],
  ) {}

  /** Le registre tel qu'il est écrit — l'ordre des visas n'importe pas. */
  static of(order: ReviewedOrder, records: readonly OrderReviewRecord[]): OrderReviews {
    return new OrderReviews(order, records);
  }

  /** Le visa en cours, ou `null`. */
  current(): OrderReviewRecord | null {
    return this.records.find((record) => record.withdrawn === null) ?? null;
  }

  /** Tous les visas, le plus récent en tête. */
  history(): readonly OrderReviewRecord[] {
    return [...this.records].sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime());
  }

  /** La commande a été révisée après son visa en cours : elle revient « à vérifier ». */
  revisedSinceReview(): boolean {
    const current = this.current();
    return current !== null && this.order.revision > current.reviewedRevision;
  }

  /**
   * Le geste « Vérifier » passerait : dans le périmètre, et sans visa en
   * cours ou révisée depuis (le visa serait alors remplacé).
   */
  reviewable(): boolean {
    return (
      outOfScopeReasonOf(this.order) === null &&
      (this.current() === null || this.revisedSinceReview())
    );
  }

  /**
   * **Viser** la commande, à sa révision courante. Une commande visée puis
   * révisée depuis voit son visa **remplacé** d'office : l'ancien est retiré
   * au nom de qui vise à nouveau, au même instant (décidé le 2026-11-21).
   *
   * @throws {OrderReviewOutOfScopeError} hors du périmètre du visa.
   * @throws {OrderAlreadyReviewedError} un visa en cours a vu la révision courante.
   * @throws {OrderReviewNoteTooLongError} la note dépasse la longueur admise.
   */
  review(input: {
    readonly id: string;
    readonly byStaffId: string;
    readonly note: string | null;
    readonly at: Date;
  }): OrderReviewRecord {
    const reason = outOfScopeReasonOf(this.order);
    if (reason !== null) {
      throw new OrderReviewOutOfScopeError(this.order.orderNumber, reason);
    }
    const current = this.current();
    if (current !== null && !this.revisedSinceReview()) {
      throw new OrderAlreadyReviewedError(this.order.orderNumber, current.reviewedAt);
    }
    if (current !== null) {
      this.withdraw({ byStaffId: input.byStaffId, at: input.at });
    }
    const record: OrderReviewRecord = {
      id: input.id,
      reviewedRevision: this.order.revision,
      reviewedByStaffId: input.byStaffId,
      reviewedAt: input.at,
      note: noteOf(input.note),
      withdrawn: null,
    };
    this.records = [...this.records, record];
    this.created = record;
    return record;
  }

  /**
   * **Retirer** le visa en cours — par n'importe quel porteur du droit.
   *
   * @throws {OrderNotReviewedError} aucun visa en cours.
   */
  withdraw(input: { readonly byStaffId: string; readonly at: Date }): OrderReviewRecord {
    const current = this.current();
    if (current === null) {
      throw new OrderNotReviewedError(this.order.orderNumber);
    }
    const withdrawn: OrderReviewRecord = {
      ...current,
      withdrawn: { byStaffId: input.byStaffId, at: input.at },
    };
    this.records = this.records.map((record) => (record.id === current.id ? withdrawn : record));
    this.withdrawnNow = withdrawn;
    return withdrawn;
  }

  /** Ce que les gestes de ce chargement ont changé. */
  changes(): OrderReviewChanges {
    return { created: this.created, withdrawn: this.withdrawnNow };
  }
}

/** Pourquoi la commande ne se vise pas, en mots d'équipe ; `null` : elle se vise. */
export function outOfScopeReasonOf(order: ReviewedOrder): string | null {
  if (order.placedByStaffId !== null) {
    return "elle a été saisie par l'équipe";
  }
  if (order.clientele !== "pro") {
    return "elle n'a pas été passée par un client pro";
  }
  if (CLOSED_STATUSES.has(order.status)) {
    return order.status === "draft" ? "c'est un brouillon" : "elle est annulée";
  }
  if (order.placedAt.getTime() < ORDER_REVIEW_STARTS_AT.getTime()) {
    return "elle a été passée avant la mise en service du visa";
  }
  return null;
}

/** Une note faite d'espaces n'en est pas une ; trop longue, elle est refusée. */
function noteOf(raw: string | null): string | null {
  const note = raw?.trim() ?? "";
  if (note === "") {
    return null;
  }
  if (note.length > ORDER_REVIEW_NOTE_MAX_LENGTH) {
    throw new OrderReviewNoteTooLongError(ORDER_REVIEW_NOTE_MAX_LENGTH);
  }
  return note;
}
