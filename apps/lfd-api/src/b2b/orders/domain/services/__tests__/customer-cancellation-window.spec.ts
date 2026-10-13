import {
  cancellationAnchorOf,
  customerCancellationWindowOf,
} from "../customer-cancellation-window.js";

/**
 * P1/P2 (plan, C6.3) — purs. Les dates sont le SUJET du test et ne sont
 * comparées qu'à l'instant passé en argument, jamais à l'horloge : exception
 * étroite du CLAUDE.md §5.
 */
const OPEN_24 = { openToB2c: true, hoursBefore: 24 };

describe("l'ancre d'une commande", () => {
  it("prend le début du créneau, en heure de Paris (hiver : UTC+1)", () => {
    expect(cancellationAnchorOf({ serviceDay: "2030-01-15", windowStart: "08:30" })).toEqual(
      new Date("2030-01-15T07:30:00.000Z"),
    );
  });

  it("prend minuit local sans heure de début — la borne la plus tôt (Q-C6.4)", () => {
    expect(cancellationAnchorOf({ serviceDay: "2030-07-15", windowStart: null })).toEqual(
      new Date("2030-07-14T22:00:00.000Z"),
    );
  });

  it("retombe sur minuit quand l'heure n'existe pas (passage à l'heure d'été)", () => {
    expect(cancellationAnchorOf({ serviceDay: "2030-03-31", windowStart: "02:30" })).toEqual(
      new Date("2030-03-30T23:00:00.000Z"),
    );
  });

  it("n'existe pas sans jour", () => {
    expect(cancellationAnchorOf({ serviceDay: null, windowStart: "08:00" })).toBeNull();
  });
});

describe("la fenêtre d'annulation d'un particulier", () => {
  const source = { serviceDay: "2030-01-15", windowStart: "08:30" };
  const until = new Date("2030-01-14T07:30:00.000Z");

  it("P1 : fermée par le réglage, quelle que soit l'heure", () => {
    expect(
      customerCancellationWindowOf({ openToB2c: false, hoursBefore: 24 }, source, new Date(0)),
    ).toEqual({ kind: "closed" });
  });

  it("ouverte jusqu'à N heures avant l'ancre, et dit jusqu'à quand", () => {
    const before = new Date(until.getTime() - 1);
    expect(customerCancellationWindowOf(OPEN_24, source, before)).toEqual({ kind: "open", until });
  });

  it("pile à la borne : encore ouverte (« jusqu'à » inclusif)", () => {
    expect(customerCancellationWindowOf(OPEN_24, source, until)).toEqual({ kind: "open", until });
  });

  it("P2 : une milliseconde après la borne, trop tard — avec l'échéance passée", () => {
    const after = new Date(until.getTime() + 1);
    expect(customerCancellationWindowOf(OPEN_24, source, after)).toEqual({
      kind: "too_late",
      until,
    });
  });

  it("P2 : une commande sans date est toujours trop tard, sans échéance", () => {
    expect(
      customerCancellationWindowOf(OPEN_24, { serviceDay: null, windowStart: null }, new Date(0)),
    ).toEqual({ kind: "too_late", until: null });
  });

  it("compte les heures réelles à la bascule d'heure d'automne (25 h ce jour-là)", () => {
    // 2030-10-27 : Paris repasse en UTC+1 à 3 h. Minuit du 28 = 23:00Z le 27 ;
    // 24 h avant = 23:00Z le 26 — soit 01:00 locale, et non minuit.
    const window = customerCancellationWindowOf(
      OPEN_24,
      { serviceDay: "2030-10-28", windowStart: null },
      new Date("2030-10-26T22:00:00.000Z"),
    );
    expect(window).toEqual({ kind: "open", until: new Date("2030-10-26T23:00:00.000Z") });
  });

  it("délai nul : jusqu'à l'ancre elle-même", () => {
    const anchor = new Date("2030-01-15T07:30:00.000Z");
    expect(
      customerCancellationWindowOf({ openToB2c: true, hoursBefore: 0 }, source, anchor),
    ).toEqual({ kind: "open", until: anchor });
  });
});
