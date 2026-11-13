import { collectionDayOf } from "../collection-calendar.js";
import { invoiceDueDay, type NextClosure, transferDueDay } from "../invoice-due-day.js";

/**
 * Les dates ne sont comparées qu'entre elles (aucune horloge lue) : l'exception
 * étroite du CLAUDE.md §5 aux dates absolues dans une fixture.
 */
const SETTINGS = { preNotificationDays: 14, collectionDaysAfterClosure: null } as const;

/** Clôture du 1er octobre 2026 à 00h00 Paris, et la suivante (lundi 5). */
const CLOSURE = new Date("2026-09-30T22:00:00.000Z");
const NEXT_CLOSURE = new Date("2026-10-04T22:00:00.000Z");

const closures: NextClosure = {
  closureAfter: (instant) => (instant < NEXT_CLOSURE ? NEXT_CLOSURE : new Date(NaN)),
};

describe("invoiceDueDay — l'échéance qu'une facture annonce", () => {
  it("émise la veille de sa clôture, annonce l'échéance de sa clôture", () => {
    const eve = new Date("2026-09-30T21:55:00.000Z");

    expect(invoiceDueDay(CLOSURE, eve, closures, SETTINGS)).toBe(
      collectionDayOf(CLOSURE, 14, null),
    );
  });

  /**
   * Régression : une facture rattrapée après sa clôture annonçait l'échéance de
   * cette clôture, alors que le lot suivant la prélève plus tard (2026-10-12).
   */
  it("émise après sa clôture, annonce l'échéance de la clôture suivante", () => {
    const caughtUp = new Date("2026-10-02T08:00:00.000Z");

    expect(invoiceDueDay(CLOSURE, caughtUp, closures, SETTINGS)).toBe(
      collectionDayOf(NEXT_CLOSURE, 14, null),
    );
  });

  it("émise à l'instant exact de sa clôture, la clôture est déjà passée", () => {
    expect(invoiceDueDay(CLOSURE, CLOSURE, closures, SETTINGS)).toBe(
      collectionDayOf(NEXT_CLOSURE, 14, null),
    );
  });
});

describe("transferDueDay — l'échéance d'une facture au virement (V6)", () => {
  it("le jour d'émission plus N jours de calendrier", () => {
    expect(transferDueDay("2026-11-02", 15)).toBe("2026-11-17");
    expect(transferDueDay("2026-11-02", 1)).toBe("2026-11-03");
    expect(transferDueDay("2026-11-02", 45)).toBe("2026-12-17");
  });

  it("franchit la fin de mois, de l'année, et le 29 février d'une année bissextile", () => {
    expect(transferDueDay("2026-01-31", 15)).toBe("2026-02-15");
    expect(transferDueDay("2026-12-20", 15)).toBe("2027-01-04");
    expect(transferDueDay("2028-02-20", 9)).toBe("2028-02-29");
  });

  it("n'est jamais reportée au jour ouvré : un samedi ou un jour fermé reste imprimé", () => {
    // Samedi 14 novembre 2026, puis vendredi 25 décembre 2026.
    expect(transferDueDay("2026-10-30", 15)).toBe("2026-11-14");
    expect(transferDueDay("2026-12-10", 15)).toBe("2026-12-25");
  });
});
