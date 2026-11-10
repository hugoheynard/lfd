import {
  BillingModeDatesChangePendingError,
  NoScheduledBillingModeDatesError,
} from "../errors/billing-mode-errors.js";
import { ModeDatesTimeline } from "../services/mode-dates-timeline.js";
import type { BillingMode } from "../value-objects/billing-mode.js";
import { BillingRhythm } from "../value-objects/billing-rhythm.js";
import {
  cancellableOf,
  pendingOf,
  type AppendOnlyStamp,
  type BillingGesture,
} from "./billing-gesture.js";

/** Un segment de dates, vivant ou annulé, tel que l'historique le garde. */
export interface ModeDatesEntry extends AppendOnlyStamp {
  readonly rhythm: BillingRhythm;
}

/**
 * Ce qu'un geste a changé — de quoi écrire le fait au journal.
 *
 * `scheduled` : `to` prendra effet à `effectiveAt` à la place de `from`.
 * `cancelled` : le segment `from` qui devait prendre effet à `effectiveAt` est
 * annulé ; `to` est ce qui restera en vigueur.
 */
export interface ModeDatesChange {
  readonly kind: "scheduled" | "cancelled";
  readonly mode: BillingMode;
  readonly from: BillingRhythm;
  readonly to: BillingRhythm;
  readonly effectiveAt: Date;
}

/** La forme persistée : les segments, et ceux que ce chargement a créés ou annulés. */
export interface BillingModeDatesRecord {
  readonly legalEntityId: string;
  readonly mode: BillingMode;
  readonly entries: readonly ModeDatesEntry[];
  /** Les segments créés depuis le chargement : à insérer. */
  readonly freshIds: readonly string[];
  /** Les segments annulés depuis le chargement : leur annulation à poser. */
  readonly cancelledIds: readonly string[];
}

/**
 * **L'historique des dates d'un mode de l'entité** — l'agrégat qui porte la
 * règle « un seul changement à la fois, au temps » (plan
 * `plan-rythme-de-facturation.md`, §16.6-1 et -2).
 *
 * Append-only : un changement AJOUTE un segment, une annulation pose
 * `cancelledAt` sur un segment qui n'a pas pris effet. Rien ne s'efface — une
 * clôture passée se relit toujours sous les dates qui étaient en vigueur, et
 * c'est ce qui rend la règle au temps sûre : le passé ne bouge pas, quel que
 * soit l'écart entre la clôture et le passage de la facture.
 */
export class BillingModeDatesHistory {
  private readonly fresh = new Set<string>();
  private readonly cancelled = new Set<string>();

  private constructor(
    readonly legalEntityId: string,
    readonly mode: BillingMode,
    private entries: readonly ModeDatesEntry[],
  ) {}

  static reconstitute(
    legalEntityId: string,
    mode: BillingMode,
    entries: readonly ModeDatesEntry[],
  ): BillingModeDatesHistory {
    // Revalide chaque segment contre le mode : une ligne d'un autre mode est refusée.
    ModeDatesTimeline.of(mode, entries);
    return new BillingModeDatesHistory(legalEntityId, mode, entries);
  }

  /** La suite des dates — les seuls segments vivants. */
  timeline(): ModeDatesTimeline {
    return ModeDatesTimeline.of(
      this.mode,
      this.entries.filter((entry) => entry.cancelledAt === null),
    );
  }

  /**
   * Programme de nouvelles dates. Elles prennent effet à la **prochaine
   * clôture de la timeline actuelle** (§16.6-3), jamais à l'instant du geste.
   *
   * @returns ce qui a changé, ou `null` : les dates demandées sont déjà celles en vigueur.
   * @throws {InvalidBillingRhythmError} jours hors bornes, ou en nombre faux pour le mode.
   * @throws {BillingModeDatesChangePendingError} un changement n'a pas encore pris effet.
   */
  schedule(days: readonly number[], gesture: BillingGesture): ModeDatesChange | null {
    const rhythm = BillingRhythm.chosen(this.mode, days);
    const pending = pendingOf(this.entries, gesture.at);
    if (pending !== null) {
      throw new BillingModeDatesChangePendingError(this.mode, pending.effectiveFrom);
    }
    const timeline = this.timeline();
    const effectiveAt = timeline.closureAfter(gesture.at);
    const from = timeline.rhythmAt(effectiveAt);
    if (rhythm.equals(from)) {
      return null;
    }
    this.entries = [
      ...this.entries,
      {
        id: gesture.segmentId,
        effectiveFrom: effectiveAt,
        rhythm,
        createdAt: gesture.at,
        createdByStaffId: gesture.staffId,
        cancelledAt: null,
        cancelledByStaffId: null,
      },
    ];
    this.fresh.add(gesture.segmentId);
    return { kind: "scheduled", mode: this.mode, from, to: rhythm, effectiveAt };
  }

  /**
   * Annule le changement programmé, avant sa prise d'effet.
   *
   * @throws {NoScheduledBillingModeDatesError} rien n'est programmé après `at`.
   */
  cancelScheduled(gesture: Omit<BillingGesture, "segmentId">): ModeDatesChange {
    const scheduled = cancellableOf(this.entries, gesture.at);
    if (scheduled === null) {
      throw new NoScheduledBillingModeDatesError(this.mode);
    }
    this.entries = this.entries.map((entry) =>
      entry.id === scheduled.id
        ? { ...entry, cancelledAt: gesture.at, cancelledByStaffId: gesture.staffId }
        : entry,
    );
    this.cancelled.add(scheduled.id);
    return {
      kind: "cancelled",
      mode: this.mode,
      from: scheduled.rhythm,
      to: this.timeline().rhythmAt(scheduled.effectiveFrom),
      effectiveAt: scheduled.effectiveFrom,
    };
  }

  toPersistence(): BillingModeDatesRecord {
    return {
      legalEntityId: this.legalEntityId,
      mode: this.mode,
      entries: this.entries,
      freshIds: [...this.fresh],
      cancelledIds: [...this.cancelled].filter((id) => !this.fresh.has(id)),
    };
  }
}
