import {
  OrderCollectionTransitionError,
  SettlementNoteRequiredError,
} from "../errors/collection-errors.js";
import type { StaffStamp } from "./collection-batch.js";

export type OrderCollectionStateName =
  "due" | "batched" | "excluded" | "collected" | "settled_otherwise";

/** Pourquoi une commande a été écartée. Des VALEURS : elles vivent en base. */
export type CollectionExclusionReason =
  | "no_mandate"
  | "payer_detached"
  | "one_off_consumed"
  | "ambiguous_creditor"
  /** Un bon qu'on ne sait pas facturer — le-prelevement-suit-la-facture. */
  | "unbillable"
  /** Un bon d'une facture émise qui tomberait sur plusieurs mandats (E4). */
  | "invoice_split";

export interface OrderCollectionState {
  readonly orderId: string;
  readonly state: OrderCollectionStateName;
  readonly batchId: string | null;
  readonly lineRank: number | null;
  readonly exclusionReason: CollectionExclusionReason | null;
  readonly amountCents: number;
  readonly settledNote: string | null;
  readonly settledByStaffId: string | null;
  readonly updatedAt: Date;
}

/** La longueur d'une note de règlement : assez pour une référence de virement. */
export const SETTLEMENT_NOTE_MAX = 500;

/**
 * **L'état d'encaissement d'UNE commande** (plan §2, diagramme d'états).
 *
 * L'absence de ligne vaut `due` : `OrderCollection.due()` est ce que
 * l'adaptateur rend pour une commande prélevable qu'aucun lot n'a encore vue.
 * Chaque transition refuse ce que le diagramme n'autorise pas — c'est ici, et
 * pas dans un handler, qu'on apprend qu'une commande prélevée ne se « règle »
 * plus autrement.
 */
export class OrderCollection {
  private constructor(private state: OrderCollectionState) {}

  static due(orderId: string, amountCents: number, at: Date): OrderCollection {
    return new OrderCollection({
      orderId,
      state: "due",
      batchId: null,
      lineRank: null,
      exclusionReason: null,
      amountCents,
      settledNote: null,
      settledByStaffId: null,
      updatedAt: at,
    });
  }

  static rehydrate(state: OrderCollectionState): OrderCollection {
    return new OrderCollection(state);
  }

  /** `due` ou `excluded` → `batched` (la raison a disparu). */
  batch(batchId: string, lineRank: number, at: Date): void {
    this.assertIn(["due", "excluded"], "entrer dans un lot");
    this.move({ state: "batched", batchId, lineRank, exclusionReason: null }, at);
  }

  /** `due` ou `excluded` → `excluded` (la raison peut changer d'un lot à l'autre). */
  exclude(reason: CollectionExclusionReason, at: Date): void {
    this.assertIn(["due", "excluded"], "être écartée");
    this.move({ state: "excluded", batchId: null, lineRank: null, exclusionReason: reason }, at);
  }

  /** `batched` → `due` : son lot a été annulé avant dépôt. */
  release(at: Date): void {
    this.assertIn(["batched"], "sortir d'un lot annulé");
    this.move({ state: "due", batchId: null, lineRank: null, exclusionReason: null }, at);
  }

  /** `batched` → `collected` : son lot a été déposé. */
  collect(at: Date): void {
    this.assertIn(["batched"], "être prélevée");
    this.state = { ...this.state, state: "collected", updatedAt: at };
  }

  /**
   * `due` ou `excluded` → `settled_otherwise`, avec une note.
   *
   * @throws {SettlementNoteRequiredError} note vide.
   */
  settleOtherwise(note: string, stamp: StaffStamp): void {
    this.assertIn(["due", "excluded"], "être réglée autrement");
    const trimmed = note.trim();
    if (trimmed === "") {
      throw new SettlementNoteRequiredError();
    }
    this.state = {
      ...this.state,
      state: "settled_otherwise",
      batchId: null,
      lineRank: null,
      exclusionReason: null,
      settledNote: trimmed.slice(0, SETTLEMENT_NOTE_MAX),
      settledByStaffId: stamp.staffId,
      updatedAt: stamp.at,
    };
  }

  get orderId(): string {
    return this.state.orderId;
  }
  get stateName(): OrderCollectionStateName {
    return this.state.state;
  }
  get exclusionReason(): CollectionExclusionReason | null {
    return this.state.exclusionReason;
  }
  get amountCents(): number {
    return this.state.amountCents;
  }

  toPersistence(): OrderCollectionState {
    return this.state;
  }

  private move(
    next: Pick<OrderCollectionState, "state" | "batchId" | "lineRank" | "exclusionReason">,
    at: Date,
  ): void {
    this.state = { ...this.state, ...next, updatedAt: at };
  }

  private assertIn(allowed: readonly OrderCollectionStateName[], gesture: string): void {
    if (!allowed.includes(this.state.state)) {
      throw new OrderCollectionTransitionError(this.state.orderId, this.state.state, gesture);
    }
  }
}
