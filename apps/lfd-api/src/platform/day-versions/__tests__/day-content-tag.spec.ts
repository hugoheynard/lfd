import { dayContentTagOf } from "../day-content-tag.js";
import { InvalidDayContentTagError } from "../invalid-day-content-tag.error.js";

/**
 * L'étiquette d'un contenu de journée : numéros en clair, sujets triés. Ces
 * tests échouent si deux ordres d'un même jeu de numéros donnent deux
 * étiquettes, ou si une étiquette ambiguë sort.
 */
describe("dayContentTagOf", () => {
  it("trie les sujets et écrit les numéros en clair", () => {
    expect(
      dayContentTagOf([
        { subject: "production", version: 456 },
        { subject: "delivery", version: 78 },
        { subject: "orders", version: 123 },
      ]),
    ).toBe("delivery:78.orders:123.production:456");
  });

  it("refuse une liste vide, un sujet mal formé ou en double, un numéro invalide", () => {
    const impossible = [
      [],
      [{ subject: "Orders", version: 1 }],
      [{ subject: "a.b", version: 1 }],
      [{ subject: "orders", version: -1 }],
      [{ subject: "orders", version: 1.5 }],
      [
        { subject: "orders", version: 1 },
        { subject: "orders", version: 1 },
      ],
    ];
    for (const versions of impossible) {
      expect(() => dayContentTagOf(versions)).toThrow(InvalidDayContentTagError);
    }
  });
});
