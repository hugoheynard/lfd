import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Une borne de la période n'est pas un jour du calendrier écrit `AAAA-MM-JJ`. */
export class UnreadableSalesPeriodDayError extends DomainError {
  constructor(bound: "from" | "to", day: string) {
    super(
      "reporting.sales_period.unreadable_day",
      `La borne « ${bound} » vaut « ${day} », qui n'est pas un jour du calendrier : écrivez-la AAAA-MM-JJ (par exemple 2026-11-01).`,
    );
  }
}

/** La période commence après sa fin. */
export class InvertedSalesPeriodError extends DomainError {
  constructor(from: string, to: string) {
    super(
      "reporting.sales_period.inverted",
      `La période commence le ${from} et finit le ${to} : le premier jour doit précéder ou égaler le dernier. Échangez les deux bornes.`,
    );
  }
}

/** La période dépasse ce qu'un seul appel sert. */
export class TooLongSalesPeriodError extends DomainError {
  constructor(from: string, to: string, days: number, maxDays: number) {
    super(
      "reporting.sales_period.too_long",
      `La période du ${from} au ${to} compte ${String(days)} jours ; un appel en sert ${String(maxDays)} au plus. Découpez-la en plusieurs appels (un mois en deux, par exemple).`,
    );
  }
}
