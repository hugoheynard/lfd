import { LineNotProducedYetError } from "../../errors/packing-station-errors.js";
import { PackingStock } from "../packing-stock.js";

function stock(received: number, returned = 0, packed = 0): PackingStock {
  return PackingStock.fromSnapshot({
    serviceDay: "2026-09-13",
    sku: "CRO",
    received,
    returned,
    packed,
  });
}

describe("PackingStock — au bac ≤ reçu − rendu", () => {
  it("met au bac ce que la réserve couvre", () => {
    const held = stock(12);
    held.take(12, "Croissant");
    expect(held.toSnapshot()).toMatchObject({ packed: 12, received: 12 });
    expect(held.free).toBe(0);
  });

  it("refuse ce qu'elle ne couvre pas, en disant combien il manque — le message de l'ancien poste", () => {
    const held = stock(12, 0, 4);
    expect(() => held.take(10, "Croissant")).toThrow(LineNotProducedYetError);
    expect(() => held.take(10, "Croissant")).toThrow(/Il manque 2 « Croissant »/);
    expect(held.packed).toBe(4);
  });

  it("ce qui est rendu au fournil ne peut plus aller au bac", () => {
    expect(() => stock(12, 5).take(8, "Croissant")).toThrow(LineNotProducedYetError);
  });

  it("ressortir du bac rend les pièces disponibles", () => {
    const held = stock(12, 0, 12);
    held.release(12);
    expect(held.free).toBe(12);
  });
});

describe("PackingStock.giveBack — le colisage décide d'un retour", () => {
  it("rend tout ce qui n'est pas au bac, au plus ce qui est demandé", () => {
    const held = stock(12, 0, 5);
    expect(held.giveBack(12)).toBe(7);
    expect(held.toSnapshot()).toMatchObject({ returned: 7, packed: 5 });
  });

  it("rend la demande entière quand la réserve la couvre", () => {
    const held = stock(20);
    expect(held.giveBack(8)).toBe(8);
    expect(held.free).toBe(12);
  });

  it("rend ZÉRO — un refus, pas une erreur — quand tout est au bac (Q5)", () => {
    const held = stock(12, 0, 12);
    expect(held.giveBack(12)).toBe(0);
    expect(held.returned).toBe(0);
  });

  /**
   * Régression (2026-10-05, VIE-001) : le serveur et le badge lisent le même
   * libre — 423 reçus, 346 posés, 77 se posent, pas un de plus.
   */
  it("pose exactement le libre que l'écran annonce, et refuse la pièce de trop", () => {
    expect(() => stock(423, 0, 346).take(77, "Croissant")).not.toThrow();
    expect(() => stock(423, 0, 346).take(78, "Croissant")).toThrow(/Il manque 1 « Croissant »/);
  });
});
