import { averageTicket, spendTrend, trendWindows } from "../customer-stats.js";

describe("averageTicket", () => {
  it("divise et arrondit au centime", () => {
    expect(averageTicket(10_000, 3)).toBe(3333);
  });

  it("rend 0 sans commande — jamais une division par zéro", () => {
    // `NaN` traverserait le JSON en `null` et casserait l'affichage.
    expect(averageTicket(0, 0)).toBe(0);
    expect(Number.isNaN(averageTicket(0, 0))).toBe(false);
  });
});

describe("spendTrend", () => {
  it("calcule la progression en pourcentage entier", () => {
    expect(spendTrend(12_000, 10_000)).toMatchObject({ percent: 20, direction: "up" });
    expect(spendTrend(8_000, 10_000)).toMatchObject({ percent: -20, direction: "down" });
  });

  it("dit « stable » quand rien ne bouge, y compris à zéro", () => {
    expect(spendTrend(10_000, 10_000).direction).toBe("flat");
    expect(spendTrend(0, 0)).toMatchObject({ percent: null, direction: "flat" });
  });

  it("N'INVENTE PAS de pourcentage quand on partait de zéro…", () => {
    // « +∞ % » ou « +100 % » seraient une mesure fabriquée.
    expect(spendTrend(5_000, 0).percent).toBeNull();
  });

  it("…mais garde la direction : partir de zéro, c'est monter", () => {
    expect(spendTrend(5_000, 0).direction).toBe("up");
  });

  it("rend les deux montants bruts, pour que l'écran puisse les afficher", () => {
    expect(spendTrend(5_000, 4_000)).toMatchObject({
      last30Cents: 5_000,
      previous30Cents: 4_000,
    });
  });
});

describe("trendWindows", () => {
  it("découpe deux fenêtres de 30 jours qui se touchent", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const { since, previousSince } = trendWindows(now);
    expect(since.toISOString()).toBe("2026-07-10T12:00:00.000Z");
    expect(previousSince.toISOString()).toBe("2026-06-10T12:00:00.000Z");
  });
});
