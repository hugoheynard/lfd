import {
  isExhausted,
  MAX_DELIVERY_ATTEMPTS,
  nextAttemptAt,
  retryDelayMs,
} from "../retry-policy.js";

const NOW = new Date(1_800_000_000_000);

describe("la reprise d'une livraison en échec", () => {
  it("attend trente secondes après le premier échec, puis double", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
  });

  it("plafonne le délai à six heures", () => {
    expect(retryDelayMs(30)).toBe(6 * 60 * 60 * 1000);
  });

  it("place le prochain essai à partir de l'instant donné, sans lire le mur", () => {
    expect(nextAttemptAt(2, NOW).getTime()).toBe(NOW.getTime() + 60_000);
  });

  it("déclare la lettre morte au dixième essai, pas avant", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(10);
    expect(isExhausted(9)).toBe(false);
    expect(isExhausted(10)).toBe(true);
  });
});
