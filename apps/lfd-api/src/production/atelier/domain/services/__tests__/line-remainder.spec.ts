import { remainderUnderCeiling } from "../line-remainder.js";

/** Le reste à sortir de « Fait » (plan `fournil/plan-niveaux-de-suivi.md`, § 3.6). */
describe("remainderUnderCeiling", () => {
  it("sans plafond, le reste du compte", () => {
    expect(remainderUnderCeiling(120, null, 80)).toBe(40);
  });

  it("le plafond d'un rouge borne le reste", () => {
    expect(remainderUnderCeiling(120, 90, 80)).toBe(10);
  });

  it("un plafond au-dessus du compte ne pousse pas au-delà du compte", () => {
    expect(remainderUnderCeiling(120, 200, 80)).toBe(40);
  });

  it("une ligne faite, ou au-delà de son plafond, n'a plus rien à sortir", () => {
    expect(remainderUnderCeiling(120, null, 130)).toBe(0);
    expect(remainderUnderCeiling(120, 60, 80)).toBe(0);
  });
});
