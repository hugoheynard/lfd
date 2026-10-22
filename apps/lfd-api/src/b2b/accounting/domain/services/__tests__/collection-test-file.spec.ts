import {
  earliestTestCollectionDay,
  TEST_COLLECTION_MIN_BUSINESS_DAYS,
} from "../collection-test-file.js";

/**
 * L'échéance la plus proche d'un essai : J + 2 jours ouvrés TARGET2, sans
 * pré-notification (Q6, Hugo 2026-10-22). Les instants sont DONNÉS et ne sont
 * comparés qu'à eux-mêmes : les dates peuvent rester absolues.
 */
describe("earliestTestCollectionDay", () => {
  it("le délai est de 2 jours ouvrés (hypothèse du 2026-10-22, en attente de la banque)", () => {
    expect(TEST_COLLECTION_MIN_BUSINESS_DAYS).toBe(2);
  });

  it("jeudi → lundi", () => {
    expect(earliestTestCollectionDay(new Date("2026-10-22T08:00:00.000Z"))).toBe("2026-10-26");
  });

  it("vendredi → mardi", () => {
    expect(earliestTestCollectionDay(new Date("2026-10-23T08:00:00.000Z"))).toBe("2026-10-27");
  });

  it("compte depuis le jour de PARIS : jeudi 23 h 30 UTC est déjà vendredi → mardi", () => {
    expect(earliestTestCollectionDay(new Date("2026-10-22T23:30:00.000Z"))).toBe("2026-10-27");
  });

  it("saute un jour fermé de TARGET2 : mercredi 23 décembre 2026 → lundi 28 (Noël, le 26)", () => {
    expect(earliestTestCollectionDay(new Date("2026-12-23T09:00:00.000Z"))).toBe("2026-12-28");
  });
});
