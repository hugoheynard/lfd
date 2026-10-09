import { trapIsFilled } from "../contact-trap.js";

describe("trapIsFilled — le champ piège", () => {
  it("laisse passer un champ vide ou blanc", () => {
    expect(trapIsFilled("")).toBe(false);
    expect(trapIsFilled("   ")).toBe(false);
  });

  it("écarte un champ rempli", () => {
    expect(trapIsFilled("https://spam.example")).toBe(true);
  });
});
