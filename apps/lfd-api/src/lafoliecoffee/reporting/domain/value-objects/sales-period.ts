import { addDays } from "@lfd/contracts";

import {
  InvertedSalesPeriodError,
  TooLongSalesPeriodError,
  UnreadableSalesPeriodDayError,
} from "../errors/sales-period-errors.js";

/** Un appel sert un mois au plus : deux appels couvrent n'importe quel mois (plan de l'export, § 3). */
export const MAX_SALES_PERIOD_DAYS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **La période d'un export des ventes** — des jours de passation (Europe/Paris),
 * bornes incluses. Refuse à la construction ce qu'aucune lecture ne doit
 * recevoir : un jour qui n'existe pas (`2026-02-30`), une période à l'envers,
 * une période de plus de 31 jours — les lectures publiées par les
 * propriétaires supposent leurs bornes déjà validées.
 */
export class SalesPeriod {
  private constructor(
    readonly from: string,
    readonly to: string,
    /** Chaque jour de la période, dans l'ordre : le résumé en sert un par jour. */
    readonly days: readonly string[],
  ) {}

  /**
   * @throws {UnreadableSalesPeriodDayError} une borne n'est pas un jour du calendrier.
   * @throws {InvertedSalesPeriodError} `from` après `to`.
   * @throws {TooLongSalesPeriodError} plus de {@link MAX_SALES_PERIOD_DAYS} jours.
   */
  static of(from: string, to: string): SalesPeriod {
    ensureDay("from", from);
    ensureDay("to", to);
    if (from > to) {
      throw new InvertedSalesPeriodError(from, to);
    }
    const span = spanOf(from, to);
    if (span > MAX_SALES_PERIOD_DAYS) {
      throw new TooLongSalesPeriodError(from, to, span, MAX_SALES_PERIOD_DAYS);
    }
    return new SalesPeriod(
      from,
      to,
      Array.from({ length: span }, (_, offset) => addDays(from, offset)),
    );
  }
}

/** Un jour du calendrier relu à l'identique : `2026-02-30` deviendrait `2026-03-02`. */
function ensureDay(bound: "from" | "to", day: string): void {
  if (!DAY_PATTERN.test(day) || addDays(day, 0) !== day) {
    throw new UnreadableSalesPeriodDayError(bound, day);
  }
}

/** Le nombre de jours, bornes incluses, pour nommer le dépassement. */
function spanOf(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}
