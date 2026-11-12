import {
  CollectionMeansChangePendingError,
  CollectionMeansReasonRequiredError,
  CollectionMeansReasonTooLongError,
  CollectionMeansReturnPendingError,
  NoScheduledCollectionMeansError,
} from "../errors/collection-means-errors.js";
import { collectionMeansAt, type PayerMeansEntry } from "../services/collection-means-timeline.js";
import {
  COLLECTION_MEANS_REASON_MAX,
  type CollectionMeans,
} from "../value-objects/collection-means.js";
import { cancellableOf, isQuietSince, pendingOf, type BillingGesture } from "./billing-gesture.js";
import type { NamedPayer } from "./payer-billing-mode-history.js";

/**
 * Les clôtures du payeur, lues sur son MODE (C1) : le moyen ne crée aucune
 * clôture, il s'y range. `PayerTimeline` en est l'implémentation.
 */
export interface PayerClosures {
  closureAfter(instant: Date): Date;
  previousClosureOf(closesAt: Date): Date;
}

/**
 * Ce que l'appelant sait du payeur au moment du geste : `opening` — il n'a
 * jamais eu de commande au compte (la première condition de l'immédiat,
 * celle du mode) ; `returnPending` — un retour bancaire de ce payeur attend
 * sa décision (V10).
 */
export interface PayerMeansStanding {
  readonly opening: boolean;
  readonly returnPending: boolean;
}

/** Un geste de changement : celui d'un historique, et son motif. */
export interface MeansGesture extends BillingGesture {
  readonly reason: string;
}

/**
 * Ce qu'un geste a changé. `scheduled` : le payeur passe de `from` à `to` à
 * `effectiveAt` (`immediate` : dès le geste, daté de la dernière clôture
 * passée). `cancelled` : le passage à `from` est annulé, `to` reste.
 */
export interface PayerMeansChange {
  readonly kind: "scheduled" | "cancelled";
  readonly from: CollectionMeans;
  readonly to: CollectionMeans;
  readonly effectiveAt: Date;
  readonly immediate: boolean;
  /** Le motif du geste ; `null` pour une annulation. */
  readonly reason: string | null;
}

/** La forme persistée, et ce que ce chargement a créé ou annulé. */
export interface PayerCollectionMeansRecord {
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly entries: readonly PayerMeansEntry[];
  readonly freshIds: readonly string[];
  readonly cancelledIds: readonly string[];
}

/**
 * **L'historique du moyen d'encaissement d'un payeur** (plan
 * `plan-paiement-au-compte-par-virement.md`, V1, V2, V10, C1) — append-only,
 * à part de l'historique du mode : il ne crée aucune clôture et n'entre ni
 * dans `PayerTimeline` ni dans `InvoicingCalendar`. Il LIT les clôtures du
 * mode du payeur pour se dater.
 *
 * Prise d'effet : immédiate si le payeur n'a jamais commandé et que rien
 * n'est écrit depuis sa dernière clôture (la règle du mode, `isQuietSince`) ;
 * sinon sa prochaine clôture. Un seul changement à la fois ; annulation
 * avant la prise d'effet. Les mandats ne sont pas touchés (V11).
 */
export class PayerCollectionMeansHistory {
  private readonly fresh = new Set<string>();
  private readonly cancelled = new Set<string>();

  private constructor(
    readonly legalEntityId: string,
    readonly payer: NamedPayer,
    private entries: readonly PayerMeansEntry[],
  ) {}

  static reconstitute(
    legalEntityId: string,
    payer: NamedPayer,
    entries: readonly PayerMeansEntry[],
  ): PayerCollectionMeansHistory {
    return new PayerCollectionMeansHistory(legalEntityId, payer, entries);
  }

  /**
   * Change le moyen du payeur. Le même moyen redemandé — déjà en vigueur, ou
   * déjà programmé — n'est pas un fait : `null`, rien ne s'écrit.
   *
   * @throws {CollectionMeansReasonRequiredError} motif vide.
   * @throws {CollectionMeansReasonTooLongError} motif trop long.
   * @throws {CollectionMeansChangePendingError} un autre moyen est programmé.
   * @throws {CollectionMeansReturnPendingError} un retour bancaire attend.
   */
  change(
    means: CollectionMeans,
    gesture: MeansGesture,
    closures: PayerClosures,
    standing: PayerMeansStanding,
  ): PayerMeansChange | null {
    const reason = reasonOf(gesture.reason);
    const pending = pendingOf(this.entries, gesture.at);
    if (pending !== null) {
      if (pending.means === means) {
        return null;
      }
      throw new CollectionMeansChangePendingError(
        this.payer.name,
        pending.means,
        pending.effectiveFrom,
      );
    }
    const from = collectionMeansAt(this.entries, gesture.at).means;
    if (from === means) {
      return null;
    }
    if (standing.returnPending) {
      throw new CollectionMeansReturnPendingError(this.payer.name);
    }
    const next = closures.closureAfter(gesture.at);
    const lastClosure = closures.previousClosureOf(next);
    const immediate = standing.opening && isQuietSince(this.entries, lastClosure);
    const effectiveAt = immediate ? lastClosure : next;
    this.entries = [
      ...this.entries,
      {
        id: gesture.segmentId,
        effectiveFrom: effectiveAt,
        means,
        reason,
        createdAt: gesture.at,
        createdByStaffId: gesture.staffId,
        cancelledAt: null,
        cancelledByStaffId: null,
      },
    ];
    this.fresh.add(gesture.segmentId);
    return { kind: "scheduled", from, to: means, effectiveAt, immediate, reason };
  }

  /**
   * Annule le moyen programmé, avant sa prise d'effet.
   *
   * @throws {NoScheduledCollectionMeansError} rien n'est programmé après `at`.
   */
  cancelScheduled(gesture: Omit<BillingGesture, "segmentId">): PayerMeansChange {
    const scheduled = cancellableOf(this.entries, gesture.at);
    if (scheduled === null) {
      throw new NoScheduledCollectionMeansError(this.payer.name);
    }
    this.entries = this.entries.map((entry) =>
      entry.id === scheduled.id
        ? { ...entry, cancelledAt: gesture.at, cancelledByStaffId: gesture.staffId }
        : entry,
    );
    this.cancelled.add(scheduled.id);
    return {
      kind: "cancelled",
      from: scheduled.means,
      to: collectionMeansAt(this.entries, scheduled.effectiveFrom).means,
      effectiveAt: scheduled.effectiveFrom,
      immediate: false,
      reason: null,
    };
  }

  toPersistence(): PayerCollectionMeansRecord {
    return {
      legalEntityId: this.legalEntityId,
      payerCompanyId: this.payer.id,
      entries: this.entries,
      freshIds: [...this.fresh],
      cancelledIds: [...this.cancelled].filter((id) => !this.fresh.has(id)),
    };
  }
}

function reasonOf(raw: string): string {
  const reason = raw.trim();
  if (reason.length === 0) {
    throw new CollectionMeansReasonRequiredError();
  }
  if (reason.length > COLLECTION_MEANS_REASON_MAX) {
    throw new CollectionMeansReasonTooLongError(reason.length);
  }
  return reason;
}
