import { firstPickupDay } from "../operation-days.js";

/** D6 : les jours proposés à un panier qui porte une bûche. Des jours entre eux, sans horloge. */

const NOEL = { from: "2026-12-20", until: "2026-12-24" };

describe("firstPickupDay", () => {
  it("sans article contraint, rend le jour des délais tel quel", () => {
    expect(firstPickupDay("2026-12-02", [])).toBe("2026-12-02");
    expect(firstPickupDay(null, [])).toBeNull();
  });

  it("repousse au premier jour de retrait quand les délais le permettent plus tôt", () => {
    expect(firstPickupDay("2026-12-02", [[NOEL]])).toBe("2026-12-20");
  });

  it("garde le jour des délais s'il tombe déjà dans la fenêtre", () => {
    expect(firstPickupDay("2026-12-22", [[NOEL]])).toBe("2026-12-22");
    expect(firstPickupDay("2026-12-24", [[NOEL]])).toBe("2026-12-24");
  });

  it("rend null quand les délais dépassent la fenêtre", () => {
    expect(firstPickupDay("2026-12-25", [[NOEL]])).toBeNull();
  });

  it("rend null pour un article qu'aucune opération ouverte ne propose", () => {
    expect(firstPickupDay("2026-12-02", [[]])).toBeNull();
  });

  it("prend la première plage qui convient parmi celles d'un même article (la galette)", () => {
    const first = { from: "2027-01-09", until: "2027-01-10" };
    const second = { from: "2027-01-16", until: "2027-01-17" };
    expect(firstPickupDay("2027-01-11", [[second, first]])).toBe("2027-01-16");
  });

  it("exige un jour commun à tous les articles contraints du panier", () => {
    const buche = [NOEL];
    const chocolats = [{ from: "2026-12-23", until: "2026-12-31" }];
    expect(firstPickupDay("2026-12-02", [buche, chocolats])).toBe("2026-12-23");
    const disjoint = [{ from: "2026-12-26", until: "2026-12-31" }];
    expect(firstPickupDay("2026-12-02", [buche, disjoint])).toBeNull();
  });
});
