import { InvoicingCalendar } from "../invoicing-calendar.js";
import { missedClosures } from "../missed-closures.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

/**
 * Une clôture de l'entité est une clôture CONNUE (plan
 * `plan-changement-de-mode-immediat.md`, §3.1) : un payeur devenu
 * hebdomadaire immédiatement le 12 novembre, daté du 1er, ne fait pas des
 * lundis 2 et 9 des clôtures de l'entité. Les dates sont le sujet et ne se
 * comparent qu'aux instants donnés : aucune horloge n'est lue.
 */

const PAYER = "c_new";
const WRITTEN = paris("2026-11-12", "11:00");

function calendarWritten(writtenAt: Date): InvoicingCalendar {
  return InvoicingCalendar.of(defaultModes(), [
    {
      payerCompanyId: PAYER,
      segments: [{ effectiveFrom: paris("2026-11-01"), mode: "weekly", writtenAt }],
    },
  ]);
}

const IMMEDIATE = calendarWritten(WRITTEN);
const PAST_MONDAYS = [paris("2026-11-02"), paris("2026-11-09")];

describe("InvoicingCalendar — les clôtures inconnues ne sont pas des clôtures de l'entité", () => {
  it("isClosure : ni le 2 ni le 9 ; le 1er et le lundi 16 le sont", () => {
    for (const monday of PAST_MONDAYS) {
      expect(IMMEDIATE.isClosure(monday)).toBe(false);
    }
    expect(IMMEDIATE.isClosure(paris("2026-11-01"))).toBe(true);
    expect(IMMEDIATE.isClosure(paris("2026-11-16"))).toBe(true);
  });

  it("closesFor et modesClosingAt suivent la même règle", () => {
    expect(IMMEDIATE.closesFor(PAYER, paris("2026-11-09"))).toBe(false);
    expect(IMMEDIATE.closesFor(PAYER, paris("2026-11-16"))).toBe(true);
    expect(IMMEDIATE.modesClosingAt(paris("2026-11-09"))).toEqual([]);
    expect(IMMEDIATE.modesClosingAt(paris("2026-11-16"))).toEqual(["weekly"]);
  });

  it("closureAfter saute les lundis passés ; lastClosureAtOrBefore revient au 1er", () => {
    expect(IMMEDIATE.closureAfter(paris("2026-11-01"))).toEqual(paris("2026-11-16"));
    expect(IMMEDIATE.lastClosureAtOrBefore(WRITTEN)).toEqual(paris("2026-11-01"));
    expect(IMMEDIATE.closureBefore(paris("2026-11-16"))).toEqual(paris("2026-11-01"));
  });

  it("closureToInvoice et closuresToAttempt n'ont aucun lundi passé", () => {
    const now = paris("2026-11-20", "08:00");
    expect(IMMEDIATE.closureToInvoice(now)).toEqual(paris("2026-11-16"));
    expect(IMMEDIATE.closuresToAttempt(now, paris("2026-10-01"))).toEqual([
      paris("2026-11-01"),
      paris("2026-11-16"),
    ]);
  });

  it("les clôtures manquées de l'entité n'ont aucun lundi passé", () => {
    const missed = missedClosures(paris("2026-11-16"), IMMEDIATE, {
      floorAt: null,
      attemptedClosures: [paris("2026-10-01")],
      lastLiveBatchClosesAt: null,
    });
    expect(missed).toEqual([paris("2026-11-01")]);
  });

  it("la période du payeur close le 16 est [9, 16[ — son histoire datée ne change pas", () => {
    expect(IMMEDIATE.payerPeriodOf(PAYER, paris("2026-11-16"))).toEqual({
      startsAt: paris("2026-11-09"),
      closesAt: paris("2026-11-16"),
    });
    expect(IMMEDIATE.payerModeClosingAt(PAYER, paris("2026-11-09"))).toBe("weekly");
  });

  it("non-régression : un segment programmé (écrit avant sa prise d'effet) garde tous ses lundis", () => {
    const scheduled = calendarWritten(paris("2026-10-20"));
    for (const monday of PAST_MONDAYS) {
      expect(scheduled.isClosure(monday)).toBe(true);
      expect(scheduled.closesFor(PAYER, monday)).toBe(true);
    }
    expect(scheduled.closureAfter(paris("2026-11-01"))).toEqual(paris("2026-11-02"));
    expect(scheduled.lastClosureAtOrBefore(WRITTEN)).toEqual(paris("2026-11-09"));
  });
});
