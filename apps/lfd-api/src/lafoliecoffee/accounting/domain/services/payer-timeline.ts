import { DEFAULT_BILLING_MODE, type BillingMode } from "../value-objects/billing-mode.js";
import type { BillingRhythm } from "../value-objects/billing-rhythm.js";
import { closureAfter, previousClosureOf, type RhythmTimeline } from "./invoicing-closures.js";
import { closuresBetween, type ModeDatesTimeline } from "./mode-dates-timeline.js";

/** Un segment de mode vivant (non annulé) d'un payeur, à partir d'une clôture. */
export interface PayerModeSegment {
  readonly effectiveFrom: Date;
  readonly mode: BillingMode;
}

/** La timeline des dates de chacun des trois modes de l'entité. */
export type ModeTimelines = Readonly<Record<BillingMode, ModeDatesTimeline>>;

/** Le mode en vigueur à un instant, et depuis quand (`null` = défaut, jamais choisi). */
export interface PayerModeInForce {
  readonly mode: BillingMode;
  readonly since: Date | null;
}

/**
 * **La suite des clôtures d'un payeur** (plan `plan-rythme-de-facturation.md`,
 * §16.2 et §16.6-3) : ses segments de mode, chacun lu sur la timeline des
 * dates de ce mode. Avant son premier segment, le mensuel.
 *
 * Un changement de mode prend effet à une clôture T de la timeline d'avant ;
 * le premier segment du nouveau mode court de T à sa prochaine clôture, même
 * si T n'est pas une clôture du nouveau mode. C'est `rhythmAt` qui compose :
 * `closureAfter` et `previousClosureOf` de R3 rendent alors la suite réelle,
 * bascule de mode ET bascule de dates comprises.
 *
 * Pur et immuable.
 */
export class PayerTimeline implements RhythmTimeline {
  private constructor(
    readonly segments: readonly PayerModeSegment[],
    private readonly modes: ModeTimelines,
  ) {}

  static of(segments: readonly PayerModeSegment[], modes: ModeTimelines): PayerTimeline {
    const sorted = [...segments].sort(
      (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
    );
    return new PayerTimeline(sorted, modes);
  }

  /** Le mode qui fait foi à `instant` — un segment dès sa prise d'effet. */
  modeAt(instant: Date): PayerModeInForce {
    let inForce: PayerModeInForce = { mode: DEFAULT_BILLING_MODE, since: null };
    for (const segment of this.segments) {
      if (segment.effectiveFrom.getTime() > instant.getTime()) {
        break;
      }
      inForce = { mode: segment.mode, since: segment.effectiveFrom };
    }
    return inForce;
  }

  rhythmAt(instant: Date): BillingRhythm {
    return this.modes[this.modeAt(instant).mode].rhythmAt(instant);
  }

  /**
   * La prise d'effet d'un changement qui n'a pas encore eu lieu (≥ `now`) :
   * jusqu'à elle, un autre changement est refusé (§16.6-2). `null` : libre.
   */
  changeLockedUntil(now: Date): Date | null {
    return this.segments.find((segment) => segment.effectiveFrom >= now)?.effectiveFrom ?? null;
  }

  /** Le segment qui prend effet STRICTEMENT après `now`, ou `null`. */
  scheduledAfter(now: Date): PayerModeSegment | null {
    return this.segments.find((segment) => segment.effectiveFrom > now) ?? null;
  }

  closureAfter(instant: Date): Date {
    return closureAfter(instant, this);
  }

  previousClosureOf(closesAt: Date): Date {
    return previousClosureOf(closesAt, this);
  }

  /** Les clôtures du payeur dans `]from, to]`, la plus ancienne d'abord. */
  closuresBetween(from: Date, to: Date): readonly Date[] {
    return closuresBetween(this, from, to);
  }

  /** Les modes que ce payeur suit à `now` ou suivra (programmé compris). */
  modesFrom(now: Date): readonly BillingMode[] {
    const current = this.modeAt(now).mode;
    const scheduled = this.segments
      .filter((segment) => segment.effectiveFrom > now)
      .map((segment) => segment.mode);
    return [...new Set([current, ...scheduled])];
  }
}
