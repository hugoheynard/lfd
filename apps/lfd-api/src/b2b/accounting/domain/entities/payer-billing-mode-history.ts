import {
  NoScheduledPayerBillingModeError,
  PayerBillingModeChangePendingError,
} from "../errors/billing-mode-errors.js";
import { PayerTimeline, type ModeTimelines } from "../services/payer-timeline.js";
import { DEFAULT_BILLING_MODE, type BillingMode } from "../value-objects/billing-mode.js";
import {
  cancellableOf,
  pendingOf,
  type AppendOnlyStamp,
  type BillingGesture,
} from "./billing-gesture.js";

/** Un segment de mode d'un payeur, vivant ou annulé. */
export interface PayerModeEntry extends AppendOnlyStamp {
  readonly mode: BillingMode;
}

/**
 * Ce qu'un geste a changé. `scheduled` : le payeur passe de `from` à `to` à
 * `effectiveAt`. `cancelled` : le passage à `from` prévu à `effectiveAt` est
 * annulé, `to` reste en vigueur.
 */
export interface PayerModeChange {
  readonly kind: "scheduled" | "cancelled";
  readonly from: BillingMode;
  readonly to: BillingMode;
  readonly effectiveAt: Date;
}

/** La forme persistée, et ce que ce chargement a créé ou annulé. */
export interface PayerBillingModeRecord {
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly entries: readonly PayerModeEntry[];
  readonly freshIds: readonly string[];
  readonly cancelledIds: readonly string[];
}

/** Le payeur, nommé pour les refus : la comptabilité le lit sans le code. */
export interface NamedPayer {
  readonly id: string;
  readonly name: string;
}

/**
 * **L'historique du mode d'un payeur** (plan `plan-rythme-de-facturation.md`,
 * §16.1 et §16.6) — append-only, la même règle que les dates d'un mode : un
 * seul changement à la fois, au temps ; annulation admise avant la prise
 * d'effet.
 *
 * La prise d'effet est la **prochaine clôture de sa timeline ACTUELLE**
 * (§16.6-3) : elle dépend des dates des modes, que l'appelant lui donne
 * (`ModeTimelines`) — l'agrégat ne lit pas la base.
 */
export class PayerBillingModeHistory {
  private readonly fresh = new Set<string>();
  private readonly cancelled = new Set<string>();

  private constructor(
    readonly legalEntityId: string,
    readonly payer: NamedPayer,
    private entries: readonly PayerModeEntry[],
  ) {}

  static reconstitute(
    legalEntityId: string,
    payer: NamedPayer,
    entries: readonly PayerModeEntry[],
  ): PayerBillingModeHistory {
    return new PayerBillingModeHistory(legalEntityId, payer, entries);
  }

  /** La suite des clôtures du payeur, lue sur les dates des modes. */
  timeline(modes: ModeTimelines): PayerTimeline {
    return PayerTimeline.of(
      this.entries.filter((entry) => entry.cancelledAt === null),
      modes,
    );
  }

  /**
   * Programme un mode.
   *
   * @returns ce qui a changé, ou `null` : c'est déjà son mode.
   * @throws {PayerBillingModeChangePendingError} un changement n'a pas encore pris effet.
   */
  change(mode: BillingMode, gesture: BillingGesture, modes: ModeTimelines): PayerModeChange | null {
    const pending = pendingOf(this.entries, gesture.at);
    if (pending !== null) {
      throw new PayerBillingModeChangePendingError(
        this.payer.name,
        pending.mode,
        pending.effectiveFrom,
      );
    }
    const timeline = this.timeline(modes);
    const effectiveAt = timeline.closureAfter(gesture.at);
    const from = timeline.modeAt(effectiveAt).mode;
    if (mode === from) {
      return null;
    }
    this.entries = [
      ...this.entries,
      {
        id: gesture.segmentId,
        effectiveFrom: effectiveAt,
        mode,
        createdAt: gesture.at,
        createdByStaffId: gesture.staffId,
        cancelledAt: null,
        cancelledByStaffId: null,
      },
    ];
    this.fresh.add(gesture.segmentId);
    return { kind: "scheduled", from, to: mode, effectiveAt };
  }

  /**
   * Annule le mode programmé, avant sa prise d'effet.
   *
   * @throws {NoScheduledPayerBillingModeError} rien n'est programmé après `at`.
   */
  cancelScheduled(gesture: Omit<BillingGesture, "segmentId">): PayerModeChange {
    const scheduled = cancellableOf(this.entries, gesture.at);
    if (scheduled === null) {
      throw new NoScheduledPayerBillingModeError(this.payer.name);
    }
    this.entries = this.entries.map((entry) =>
      entry.id === scheduled.id
        ? { ...entry, cancelledAt: gesture.at, cancelledByStaffId: gesture.staffId }
        : entry,
    );
    this.cancelled.add(scheduled.id);
    const remaining = this.entries
      .filter(
        (entry) => entry.cancelledAt === null && entry.effectiveFrom <= scheduled.effectiveFrom,
      )
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    return {
      kind: "cancelled",
      from: scheduled.mode,
      to: remaining.at(-1)?.mode ?? DEFAULT_BILLING_MODE,
      effectiveAt: scheduled.effectiveFrom,
    };
  }

  toPersistence(): PayerBillingModeRecord {
    return {
      legalEntityId: this.legalEntityId,
      payerCompanyId: this.payer.id,
      entries: this.entries,
      freshIds: [...this.fresh],
      cancelledIds: [...this.cancelled].filter((id) => !this.fresh.has(id)),
    };
  }
}
