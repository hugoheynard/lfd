import {
  FutureStatementMonthError,
  InvalidStatementMonthError,
} from "../../errors/statement-errors.js";
import { StatementMonth } from "../statement-month.js";

/**
 * Dates absolues, exception prévue (CLAUDE.md §5) : l'instant est DONNÉ au
 * value object, qui ne lit aucune horloge.
 */
describe("StatementMonth", () => {
  it("refuse ce qui n'est pas AAAA-MM", () => {
    for (const raw of ["2026-13", "2026-9", "26-09", "2026-09-01", ""]) {
      expect(() => StatementMonth.parse(raw)).toThrow(InvalidStatementMonthError);
    }
  });

  it("lit le mois dans le fuseau des affaires — 30 sept. 23h UTC est en octobre à Paris", () => {
    expect(StatementMonth.containing(new Date("2026-09-30T22:30:00.000Z")).toString()).toBe(
      "2026-10",
    );
  });

  it("refuse un mois qui n'a pas commencé", () => {
    const now = new Date("2026-10-05T10:00:00.000Z");
    expect(() => StatementMonth.requested("2026-11", now)).toThrow(FutureStatementMonthError);
    expect(StatementMonth.requested("2026-10", now).toString()).toBe("2026-10");
  });

  it("recule d'un mois en passant l'année", () => {
    expect(StatementMonth.parse("2026-01").previous().toString()).toBe("2025-12");
  });

  it("borne le cycle à minuit local, du 1er au 1er", () => {
    const cycle = StatementMonth.parse("2026-10").cycle();
    expect(cycle.startsAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(cycle.closesAt.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});
