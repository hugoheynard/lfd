import { InvalidBillingRhythmError } from "../errors/billing-rhythm-errors.js";
import { defaultDatesOf, type BillingMode } from "../value-objects/billing-mode.js";
import type { BillingRhythm } from "../value-objects/billing-rhythm.js";
import { closureAfter, previousClosureOf, type RhythmTimeline } from "./invoicing-closures.js";

/** Un segment de dates vivant (non annulé) : les dates d'un mode à partir d'une clôture. */
export interface ModeDatesSegment {
  readonly effectiveFrom: Date;
  readonly rhythm: BillingRhythm;
}

/** Les dates en vigueur à un instant, et depuis quand (`null` = défaut, jamais réglé). */
export interface ModeDatesInForce {
  readonly rhythm: BillingRhythm;
  readonly since: Date | null;
}

/**
 * **La suite des dates d'un mode** — ses segments NON ANNULÉS, du plus ancien
 * au plus récent (plan `plan-rythme-de-facturation.md`, §16.6-1). Avant le
 * premier segment, les dates par défaut du mode.
 *
 * Chaque segment prend effet à une clôture de la suite d'avant (c'est
 * l'historique qui le garantit) : `closureAfter`, `previousClosureOf` et
 * `closuresBetween` sont donc ceux de R3, sans cas particulier.
 *
 * Pur et immuable.
 */
export class ModeDatesTimeline implements RhythmTimeline {
  private constructor(
    readonly mode: BillingMode,
    readonly segments: readonly ModeDatesSegment[],
  ) {}

  /**
   * @throws {InvalidBillingRhythmError} un segment n'a pas la forme du mode.
   */
  static of(mode: BillingMode, segments: readonly ModeDatesSegment[]): ModeDatesTimeline {
    const wrong = segments.find((segment) => segment.rhythm.kind !== mode);
    if (wrong !== undefined) {
      throw new InvalidBillingRhythmError(
        `des dates « ${wrong.rhythm.kind} » ne peuvent pas être celles du mode « ${mode} ».`,
      );
    }
    const sorted = [...segments].sort(
      (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
    );
    return new ModeDatesTimeline(mode, sorted);
  }

  /** Un mode jamais réglé : ses dates par défaut, pour toujours. */
  static defaultOf(mode: BillingMode): ModeDatesTimeline {
    return new ModeDatesTimeline(mode, []);
  }

  rhythmAt(instant: Date): BillingRhythm {
    return this.inForceAt(instant).rhythm;
  }

  /** Les dates qui font foi à `instant` — un segment dès sa prise d'effet. */
  inForceAt(instant: Date): ModeDatesInForce {
    let inForce: ModeDatesInForce = { rhythm: defaultDatesOf(this.mode), since: null };
    for (const segment of this.segments) {
      if (segment.effectiveFrom.getTime() > instant.getTime()) {
        break;
      }
      inForce = { rhythm: segment.rhythm, since: segment.effectiveFrom };
    }
    return inForce;
  }

  /**
   * La prise d'effet d'un changement qui n'a pas encore eu lieu (≥ `now`) :
   * jusqu'à elle, un autre changement est refusé (§16.6-2). `null` : libre.
   */
  changeLockedUntil(now: Date): Date | null {
    return this.segments.find((segment) => segment.effectiveFrom >= now)?.effectiveFrom ?? null;
  }

  /** Le segment qui prend effet STRICTEMENT après `now`, ou `null`. */
  scheduledAfter(now: Date): ModeDatesSegment | null {
    return this.segments.find((segment) => segment.effectiveFrom > now) ?? null;
  }

  /** La prochaine clôture strictement après `instant`, programmé compris. */
  closureAfter(instant: Date): Date {
    return closureAfter(instant, this);
  }

  /** La clôture précédente réelle de `closesAt`, bascule comprise. */
  previousClosureOf(closesAt: Date): Date {
    return previousClosureOf(closesAt, this);
  }

  /** Les clôtures de `]from, to]`, la plus ancienne d'abord. */
  closuresBetween(from: Date, to: Date): readonly Date[] {
    return closuresBetween(this, from, to);
  }

  /** Deux suites égales : même mode, mêmes segments. */
  equals(other: ModeDatesTimeline): boolean {
    return (
      this.mode === other.mode &&
      this.segments.length === other.segments.length &&
      this.segments.every((segment, index) => {
        const twin = other.segments[index];
        return (
          twin !== undefined &&
          twin.effectiveFrom.getTime() === segment.effectiveFrom.getTime() &&
          twin.rhythm.equals(segment.rhythm)
        );
      })
    );
  }
}

/** Les clôtures d'une timeline dans `]from, to]`, la plus ancienne d'abord. */
export function closuresBetween(timeline: RhythmTimeline, from: Date, to: Date): readonly Date[] {
  const closures: Date[] = [];
  for (
    let cursor = closureAfter(from, timeline);
    cursor.getTime() <= to.getTime();
    cursor = closureAfter(cursor, timeline)
  ) {
    closures.push(cursor);
  }
  return closures;
}
