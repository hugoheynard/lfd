import { StockMoveQuantityInvalidError } from "../../errors/packing-shop-release-errors.js";
import { LineNotProducedYetError } from "../../errors/packing-station-errors.js";
import { PackingStock } from "../packing-stock.js";

function stock(received: number, returned = 0, packed = 0, sentToShop = 0): PackingStock {
  return PackingStock.fromSnapshot({
    serviceDay: "2030-03-12",
    sku: "CRO",
    received,
    returned,
    packed,
    sentToShop,
    reservations: [],
  });
}

/** Invariant du colisage : au bac + envoyé + rendu ≤ reçu, et jamais un négatif. */
function expectInvariant(held: PackingStock): void {
  const { received, returned, packed, sentToShop } = held.toSnapshot();
  expect(returned).toBeGreaterThanOrEqual(0);
  expect(packed).toBeGreaterThanOrEqual(0);
  expect(sentToShop).toBeGreaterThanOrEqual(0);
  expect(packed + sentToShop + returned).toBeLessThanOrEqual(received);
}

describe("PackingStock — frontières de l'invariant", () => {
  /**
   * Régression : take(-3) passait la garde de manque (rien ne manque pour
   * moins que rien) et faisait BAISSER le bac (2026-10-25).
   */
  it.each([-3, 1.5])("refuse un mouvement de bac de %s pièce(s), sans rien toucher", (quantity) => {
    const held = stock(10, 0, 4);
    for (const move of [
      () => held.take(quantity, "Croissant"),
      () => held.takeForResupply("rs-1", quantity, "Croissant"),
      () => held.release(quantity),
      () => held.releaseFromResupply("rs-1", quantity),
    ]) {
      expect(move).toThrow(StockMoveQuantityInvalidError);
    }
    expect(held.toSnapshot().packed).toBe(4);
  });

  it("un mouvement de zéro pièce est admis et ne change rien", () => {
    const held = stock(10, 0, 4);
    held.take(0, "Croissant");
    held.release(0);
    expect(held.toSnapshot().packed).toBe(4);
  });

  it("un libre à zéro refuse une seule pièce, et la pièce suivante au cran près passe", () => {
    expect(() => stock(10, 0, 10).take(1, "Croissant")).toThrow(/Il manque 1 « Croissant »/);
    expect(() => stock(10, 0, 9).take(1, "Croissant")).not.toThrow();
  });

  it("l'envoi en boutique compte dans le plafond : le bac ne reprend pas ce qui est parti", () => {
    const held = stock(10, 0, 4, 6);
    expect(held.free).toBe(0);
    expect(() => held.take(1, "Croissant")).toThrow(LineNotProducedYetError);
    expectInvariant(held);
  });

  it("le retour au fournil ne rend pas ce qui est parti en boutique", () => {
    const held = stock(10, 0, 2, 5);
    expect(held.giveBack(10)).toBe(3);
    expect(held.free).toBe(0);
    expectInvariant(held);
  });

  it("un retour demandé à zéro ne rend rien et ne touche à rien", () => {
    const held = stock(10);
    expect(held.giveBack(0)).toBe(0);
    expect(held.toSnapshot()).toMatchObject({ returned: 0, packed: 0 });
  });

  /**
   * Ressortir plus que ce qui est au bac ne fait pas de pièces négatives : le
   * libre ne dépasse alors jamais le reçu.
   */
  it("ressortir plus que le bac ne contient plafonne à zéro, sans libre fantôme", () => {
    const held = stock(10, 0, 3);
    held.release(50);
    expect(held.packed).toBe(0);
    expect(held.free).toBe(10);
  });

  it("un libre jamais négatif même si la base est en dette", () => {
    expect(stock(5, 0, 9).free).toBe(0);
  });

  /**
   * Régression attendue : une quantité négative ne doit ni créer de pièces au
   * bac, ni « dé-rendre » au fournil ce qui lui est déjà reparti.
   */
  it("un retour négatif ne défait pas un retour déjà fait", () => {
    const held = stock(10, 4);
    held.giveBack(-3);
    expect(held.returned).toBeGreaterThanOrEqual(4);
    expectInvariant(held);
  });
});
