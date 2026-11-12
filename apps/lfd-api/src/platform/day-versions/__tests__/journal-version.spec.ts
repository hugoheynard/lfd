import { journalVersion, JournalVersionOverflowError } from "../journal-version.js";

describe("journalVersion — max(id) et count(*), un seul numéro", () => {
  it("rend 0 pour un journal vide", () => {
    expect(journalVersion(null, 0)).toBe(0);
  });

  /**
   * Régression : A prend l'id 100, B le 101 et valide d'abord ; A valide
   * ensuite. Le max reste 101 — seul le compte dit que A est arrivé.
   */
  it("change quand une écriture validée en retard ne fait pas monter le max", () => {
    const seenAfterB = journalVersion(101n, 1);
    const seenAfterA = journalVersion(101n, 2);

    expect(seenAfterA).not.toBe(seenAfterB);
  });

  it("change quand une purge retire des lignes sans toucher au max", () => {
    expect(journalVersion(500n, 40)).not.toBe(journalVersion(500n, 12));
  });

  it("refuse un identifiant qu'un nombre JSON ne porte plus sans perte", () => {
    expect(() => journalVersion(2n ** 33n, 1)).toThrow(JournalVersionOverflowError);
  });
});
