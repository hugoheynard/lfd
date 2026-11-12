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
 * annulé, `to` reste en vigueur. `immediate` : le nouveau mode vaut dès le
 * geste, daté de la dernière clôture passée (`effectiveAt`).
 */
export interface PayerModeChange {
  readonly kind: "scheduled" | "cancelled";
  readonly from: BillingMode;
  readonly to: BillingMode;
  readonly effectiveAt: Date;
  readonly immediate: boolean;
}

/**
 * Ce que l'appelant sait du payeur au moment du geste : `opening` — il n'a
 * jamais eu de commande au compte, par aucun chemin de rattachement. C'est la
 * première condition de l'immédiat ; l'agrégat juge les deux autres.
 */
export interface PayerOpening {
  readonly opening: boolean;
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
      this.living().map((entry) => ({
        effectiveFrom: entry.effectiveFrom,
        mode: entry.mode,
        writtenAt: entry.createdAt,
      })),
      modes,
    );
  }

  /**
   * Change le mode du payeur. **Immédiat** (plan
   * `plan-changement-de-mode-immediat.md`, §3.2) quand il n'a jamais commandé
   * (`opening`), qu'aucun segment vivant ne commence à la dernière clôture
   * passée C0 ou après, et qu'aucun segment n'a été écrit depuis C0 : le
   * segment est daté de C0, une vraie clôture de sa suite, et écrit
   * maintenant. Sinon **programmé** à sa prochaine clôture.
   *
   * Un payeur sans segment vivant n'a pas encore choisi : son premier geste
   * écrit un segment même s'il redemande le mensuel (§3.3).
   *
   * @returns ce qui a changé, ou `null` : c'est déjà le mode qu'il a choisi.
   * @throws {PayerBillingModeChangePendingError} un changement n'a pas encore pris effet.
   */
  change(
    mode: BillingMode,
    gesture: BillingGesture,
    modes: ModeTimelines,
    payer: PayerOpening,
  ): PayerModeChange | null {
    const pending = pendingOf(this.entries, gesture.at);
    if (pending !== null) {
      throw new PayerBillingModeChangePendingError(
        this.payer.name,
        pending.mode,
        pending.effectiveFrom,
      );
    }
    const timeline = this.timeline(modes);
    const next = timeline.closureAfter(gesture.at);
    const lastClosure = timeline.previousClosureOf(next);
    const immediate = payer.opening && this.isQuietSince(lastClosure);
    const effectiveAt = immediate ? lastClosure : next;
    const from = timeline.modeAt(immediate ? gesture.at : effectiveAt).mode;
    if (mode === from && this.living().length > 0) {
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
    return { kind: "scheduled", from, to: mode, effectiveAt, immediate };
  }

  /**
   * Rien n'a bougé depuis `closure` : aucun segment vivant ne commence à elle
   * ou après, et aucun segment, annulé compris, n'a été écrit depuis — un
   * seul immédiat par période.
   */
  private isQuietSince(closure: Date): boolean {
    return !this.entries.some(
      (entry) =>
        entry.createdAt.getTime() >= closure.getTime() ||
        (entry.cancelledAt === null && entry.effectiveFrom.getTime() >= closure.getTime()),
    );
  }

  private living(): readonly PayerModeEntry[] {
    return this.entries.filter((entry) => entry.cancelledAt === null);
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
      immediate: false,
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
