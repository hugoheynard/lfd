import { staleTranslations } from "../shop-copy-staleness.js";
import { AT, LATER } from "./shop-copy-fixtures.js";

describe("les traductions en retard sur le français (A2)", () => {
  it("rien tant que le français n'a pas été touché", () => {
    expect(staleTranslations({ en: AT })).toEqual([]);
  });

  it("une traduction jamais touchée ou touchée avant le français est en retard", () => {
    expect(staleTranslations({ fr: LATER, en: AT, it: null })).toEqual(["en", "it"]);
  });

  it("une traduction touchée après — ou au même instant — a suivi", () => {
    expect(staleTranslations({ fr: AT, en: LATER, it: AT })).toEqual([]);
  });
});
