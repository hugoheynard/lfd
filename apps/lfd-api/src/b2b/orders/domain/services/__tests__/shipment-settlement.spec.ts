import { settlesOnRemainder, statusAfterFirstHandover } from "../shipment-settlement.js";

// Plan E7 reliquat, lot L5b : soldée = plus aucun envoi vivant à remettre.
describe("statusAfterFirstHandover — la remise du rang 1", () => {
  it("sans reste vivant : soldée, comme avant", () => {
    expect(statusAfterFirstHandover(false)).toBe("fulfilled");
  });

  it("un reste attend encore : en partie retirée", () => {
    expect(statusAfterFirstHandover(true)).toBe("partially_handed_over");
  });
});

describe("settlesOnRemainder — la remise d'un reste", () => {
  it("le dernier reste, rang 1 retiré : solde", () => {
    expect(settlesOnRemainder("partially_handed_over", false)).toBe(true);
  });

  it("un autre reste attend : ne solde pas", () => {
    expect(settlesOnRemainder("partially_handed_over", true)).toBe(false);
  });

  it.each(["ready", "confirmed", "fulfilled", "cancelled"] as const)(
    "une commande « %s » ne se solde pas par un reste",
    (status) => {
      expect(settlesOnRemainder(status, false)).toBe(false);
    },
  );
});
