import { InvalidBillingRhythmError } from "../errors/billing-rhythm-errors.js";

/**
 * Jours du mois admis comme clôture : 1 à 28. Février n'a pas de 29, et « le
 * dernier jour du mois » se dit déjà « le 1er » — la clôture à 00h00 ferme la
 * veille (plan `plan-rythme-de-facturation.md`, §2.1).
 */
export const BILLING_CLOSING_DAY_MIN = 1;
export const BILLING_CLOSING_DAY_MAX = 28;

/** Jours de semaine ISO : 1 = lundi … 7 = dimanche. */
export const BILLING_WEEKDAY_MIN = 1;
export const BILLING_WEEKDAY_MAX = 7;

/** Défaut du mensuel : le 1er, le comportement d'avant le rythme. */
export const DEFAULT_MONTHLY_CLOSING_DAY = 1;
/** Défauts du bimensuel : le 1er et le 16. */
export const DEFAULT_SEMIMONTHLY_CLOSING_DAYS: readonly [number, number] = [1, 16];
/** Défaut de l'hebdomadaire : le lundi, qui ferme la semaine du dimanche. */
export const DEFAULT_WEEKLY_CLOSING_WEEKDAY = 1;

export type BillingRhythmKind = "monthly" | "semimonthly" | "weekly";

/** Le genre tel que la comptabilité le lit dans un refus. */
const KIND_LABELS: Readonly<Record<BillingRhythmKind, string>> = {
  monthly: "mensuel",
  semimonthly: "deux fois par mois",
  weekly: "hebdomadaire",
};

/** La forme persistée : un genre et ses jours, sans rien de Prisma. */
export interface BillingRhythmRecord {
  readonly kind: string;
  readonly days: readonly number[];
}

/**
 * **Le rythme de facturation d'une entité** — les jours où sa période se clôt.
 *
 * Il ne porte que des JOURS : l'heure de clôture (00h00 à Paris) et le calcul
 * des instants vivent dans `billing-cycle.ts`, qui seul connaît le fuseau. Le
 * rythme est celui de l'ENTITÉ, pas du payeur (plan, §10) : tous ses payeurs
 * closent ensemble.
 *
 * Les jours d'un bimensuel sont rangés triés, pour que deux rythmes égaux aient
 * une seule écriture en base.
 */
export class BillingRhythm {
  private constructor(
    readonly kind: BillingRhythmKind,
    readonly days: readonly number[],
  ) {}

  /** Mensuel le 1er : ce que porte une entité qui n'a rien réglé. */
  static default(): BillingRhythm {
    return BillingRhythm.monthly(DEFAULT_MONTHLY_CLOSING_DAY);
  }

  /** @throws {InvalidBillingRhythmError} jour hors de 1 à 28. */
  static monthly(closingDay: number): BillingRhythm {
    requireDayOfMonth(closingDay);
    return new BillingRhythm("monthly", [closingDay]);
  }

  /** @throws {InvalidBillingRhythmError} jour hors bornes, ou deux jours égaux. */
  static semimonthly(firstDay: number, secondDay: number): BillingRhythm {
    requireDayOfMonth(firstDay);
    requireDayOfMonth(secondDay);
    if (firstDay === secondDay) {
      throw new InvalidBillingRhythmError(
        `les deux clôtures du bimensuel tombent le même jour (le ${String(firstDay)}). ` +
          `Choisissez deux jours différents, ou un rythme mensuel.`,
      );
    }
    const sorted = firstDay < secondDay ? [firstDay, secondDay] : [secondDay, firstDay];
    return new BillingRhythm("semimonthly", sorted);
  }

  /** @throws {InvalidBillingRhythmError} jour de semaine hors de 1 à 7. */
  static weekly(closingWeekday: number): BillingRhythm {
    if (!isIntegerBetween(closingWeekday, BILLING_WEEKDAY_MIN, BILLING_WEEKDAY_MAX)) {
      throw new InvalidBillingRhythmError(
        `jour de semaine ${String(closingWeekday)} inconnu : attendu un entier de ` +
          `1 (lundi) à 7 (dimanche).`,
      );
    }
    return new BillingRhythm("weekly", [closingWeekday]);
  }

  /**
   * Le rythme CHOISI à l'écran : un genre et les jours saisis. Le nombre de
   * jours est jugé ici, avec un message qui parle de la saisie — pas de la
   * base, comme celui de {@link fromRecord}.
   *
   * @throws {InvalidBillingRhythmError} nombre de jours faux pour le genre, ou jour hors bornes.
   */
  static chosen(kind: BillingRhythmKind, days: readonly number[]): BillingRhythm {
    const expected = kind === "semimonthly" ? 2 : 1;
    const [first, second] = days;
    if (days.length !== expected || first === undefined) {
      throw new InvalidBillingRhythmError(
        `${String(days.length)} jour(s) reçu(s) pour un rythme ${KIND_LABELS[kind]} : ` +
          `il en faut ${String(expected)}.`,
      );
    }
    if (kind === "monthly") {
      return BillingRhythm.monthly(first);
    }
    if (kind === "weekly") {
      return BillingRhythm.weekly(first);
    }
    return BillingRhythm.semimonthly(first, second ?? first);
  }

  /**
   * Relit la forme persistée, en repassant par les factories : une ligne
   * corrompue est refusée, jamais réhydratée telle quelle.
   *
   * @throws {InvalidBillingRhythmError} genre inconnu ou nombre de jours faux.
   */
  static fromRecord(record: BillingRhythmRecord): BillingRhythm {
    const [first, second] = record.days;
    const count = record.days.length;
    if (record.kind === "monthly" && count === 1 && first !== undefined) {
      return BillingRhythm.monthly(first);
    }
    if (record.kind === "weekly" && count === 1 && first !== undefined) {
      return BillingRhythm.weekly(first);
    }
    if (
      record.kind === "semimonthly" &&
      count === 2 &&
      first !== undefined &&
      second !== undefined
    ) {
      return BillingRhythm.semimonthly(first, second);
    }
    throw new InvalidBillingRhythmError(
      `forme enregistrée « ${record.kind} » avec ${String(count)} jour(s) inconnue : ` +
        `attendu mensuel ou hebdomadaire avec un jour, bimensuel avec deux.`,
    );
  }

  toRecord(): BillingRhythmRecord {
    return { kind: this.kind, days: [...this.days] };
  }

  /**
   * Ce jour local est-il une clôture ?
   *
   * @param dayOfMonth 1 à 31.
   * @param isoWeekday 1 = lundi … 7 = dimanche.
   */
  closesOn(dayOfMonth: number, isoWeekday: number): boolean {
    const reference = this.kind === "weekly" ? isoWeekday : dayOfMonth;
    return this.days.includes(reference);
  }

  equals(other: BillingRhythm): boolean {
    return (
      this.kind === other.kind &&
      this.days.length === other.days.length &&
      this.days.every((day, index) => other.days[index] === day)
    );
  }
}

function requireDayOfMonth(day: number): void {
  if (!isIntegerBetween(day, BILLING_CLOSING_DAY_MIN, BILLING_CLOSING_DAY_MAX)) {
    throw new InvalidBillingRhythmError(
      `jour de clôture ${String(day)} hors bornes : attendu un entier de 1 à 28 ` +
        `(pour clore en fin de mois, choisissez le 1er — la clôture à 00h00 ferme la veille).`,
    );
  }
}

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
