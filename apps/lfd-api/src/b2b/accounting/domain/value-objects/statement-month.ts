import { instantToLocal } from "@lfd/contracts";

import {
  FutureStatementMonthError,
  InvalidStatementMonthError,
} from "../errors/statement-errors.js";
import { calendarCycle, type BillingCycle } from "../services/billing-cycle.js";

const MONTH_SHAPE = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const MONTHS_PER_YEAR = 12;

/**
 * **Le mois civil d'un relevé** — `AAAA-MM`, dans le fuseau des affaires.
 *
 * Avant S4-0, aucune clôture n'est enregistrée : un cycle passé ne se
 * reconstitue qu'en mois civil (plan `agregation-des-commandes`, §2). Ce value
 * object est donc l'identité d'un cycle de relevé, et il le restera tant que la
 * première clôture enregistrée tombera sur un 1er — contrainte que S4-0 hérite.
 *
 * Immuable, auto-validé : un mois mal formé ne circule pas en `string`.
 */
export class StatementMonth {
  private constructor(
    readonly year: number,
    /** 1 à 12. */
    readonly month: number,
  ) {}

  /** @throws {InvalidStatementMonthError} la chaîne n'est pas `AAAA-MM`. */
  static parse(raw: string): StatementMonth {
    const match = MONTH_SHAPE.exec(raw);
    if (match === null) {
      throw new InvalidStatementMonthError(raw);
    }
    return new StatementMonth(Number(match[1]), Number(match[2]));
  }

  /** Le mois qui contient `now`, lu dans le fuseau des affaires — jamais en UTC. */
  static containing(now: Date): StatementMonth {
    return StatementMonth.parse(instantToLocal(now).day.slice(0, 7));
  }

  /**
   * Un mois demandé, refusé s'il n'a pas commencé à `now`.
   *
   * @throws {InvalidStatementMonthError} la chaîne n'est pas `AAAA-MM`.
   * @throws {FutureStatementMonthError} le mois est postérieur à celui de `now`.
   */
  static requested(raw: string, now: Date): StatementMonth {
    const month = StatementMonth.parse(raw);
    if (month.isAfter(StatementMonth.containing(now))) {
      throw new FutureStatementMonthError(month.toString());
    }
    return month;
  }

  previous(): StatementMonth {
    return this.month === 1
      ? new StatementMonth(this.year - 1, MONTHS_PER_YEAR)
      : new StatementMonth(this.year, this.month - 1);
  }

  equals(other: StatementMonth): boolean {
    return this.year === other.year && this.month === other.month;
  }

  isAfter(other: StatementMonth): boolean {
    return this.year * MONTHS_PER_YEAR + this.month > other.year * MONTHS_PER_YEAR + other.month;
  }

  /** `[1er 00h00 locales, 1er du mois suivant 00h00 locales[`. */
  cycle(): BillingCycle {
    return calendarCycle(this.year, this.month);
  }

  toString(): string {
    return `${String(this.year)}-${String(this.month).padStart(2, "0")}`;
  }
}
