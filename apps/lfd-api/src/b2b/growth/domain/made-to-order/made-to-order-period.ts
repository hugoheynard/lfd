import { MadeToOrderReportPeriodError } from "../errors/made-to-order-report-errors.js";

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Le rang d'un jour `AAAA-MM-JJ` en jours depuis l'époque, ou `null` s'il n'existe pas. */
function dayNumberOf(day: string): number | null {
  const match = ISO_DAY.exec(day);
  if (match === null) {
    return null;
  }
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = Date.UTC(year, month - 1, date);
  const back = new Date(at);
  // 2026-02-31 deviendrait le 3 mars : on refuse plutôt que de glisser.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== date) {
    return null;
  }
  return at / DAY_MS;
}

/**
 * **La période du rapport par client** : deux jours de passation à Paris,
 * bornes comprises, au plus `maxDays` jours (plan sur mesure, § 5 ter).
 * Refuse un jour impossible, une fin avant le début, une période trop longue.
 */
export class MadeToOrderPeriod {
  private constructor(
    readonly from: string,
    readonly to: string,
  ) {}

  static of(from: string, to: string, maxDays: number): MadeToOrderPeriod {
    const start = dayNumberOf(from);
    const end = dayNumberOf(to);
    if (start === null || end === null) {
      throw new MadeToOrderReportPeriodError(
        `Le jour ${start === null ? from : to} n'existe pas : saisissez une date au format AAAA-MM-JJ.`,
      );
    }
    if (end < start) {
      throw new MadeToOrderReportPeriodError(
        `La période finit le ${to}, avant son début le ${from} : inversez les deux dates.`,
      );
    }
    if (end - start + 1 > maxDays) {
      throw new MadeToOrderReportPeriodError(
        `La période du ${from} au ${to} dépasse ${String(maxDays)} jours : raccourcissez-la.`,
      );
    }
    return new MadeToOrderPeriod(from, to);
  }
}

/**
 * Les `count` mois `AAAA-MM` qui finissent par `lastMonth`, du plus ancien au
 * plus récent.
 */
export function monthsEndingAt(lastMonth: string, count: number): readonly string[] {
  const [year, month] = lastMonth.split("-").map(Number);
  const last = (year ?? 0) * 12 + (month ?? 1) - 1;
  return Array.from({ length: count }, (_, index) => {
    const rank = last - (count - 1 - index);
    const y = Math.floor(rank / 12);
    const m = (rank % 12) + 1;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  });
}
