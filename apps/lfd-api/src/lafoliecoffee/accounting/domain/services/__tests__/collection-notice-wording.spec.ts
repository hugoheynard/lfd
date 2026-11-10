import { noticeAmount, noticeDay } from "../collection-notice-wording.js";

describe("ce que l'avis imprime", () => {
  it("un montant en euros, en entiers, avec l'espace fine des milliers", () => {
    expect(noticeAmount(123_456)).toBe("1 234,56 €");
    expect(noticeAmount(5)).toBe("0,05 €");
    expect(noticeAmount(100_000_000)).toBe("1 000 000,00 €");
  });

  it("un jour civil en toutes lettres, sans qu'aucun fuseau ne le décale", () => {
    expect(noticeDay("2026-10-15")).toBe("jeudi 15 octobre 2026");
    expect(noticeDay("2027-01-01")).toBe("vendredi 1er janvier 2027");
  });
});
