import {
  BOUGHT_WITH_CART_PLACES,
  BOUGHT_WITH_MIN_CLIENTS,
  BOUGHT_WITH_WINDOW_DAYS,
  rankBoughtWith,
  type CoPurchasePair,
} from "../bought-with.js";

const pair = (anchorSku: string, withSku: string, clients: number): CoPurchasePair => ({
  anchorSku,
  withSku,
  clients,
});

const NONE_TAKEN = { inCart: ["CRO"], taken: [] };

describe("rankBoughtWith", () => {
  it("les constantes décidées : 90 jours, 5 clients distincts, une place au panier", () => {
    expect(BOUGHT_WITH_WINDOW_DAYS).toBe(90);
    expect(BOUGHT_WITH_MIN_CLIENTS).toBe(5);
    expect(BOUGHT_WITH_CART_PLACES).toBe(1);
  });

  it("le seuil est strict : 5 clients passent, 4 non", () => {
    expect(rankBoughtWith([pair("CRO", "CAF", 5)], NONE_TAKEN)).toEqual([
      { sku: "CAF", withSku: "CRO" },
    ]);
    expect(rankBoughtWith([pair("CRO", "CAF", 4)], NONE_TAKEN)).toEqual([]);
  });

  it("classe au soutien décroissant, puis au SKU — ordre stable quel que soit l'ordre reçu", () => {
    const pairs = [pair("CRO", "JUS", 6), pair("CRO", "THE", 9), pair("CRO", "CAF", 6)];

    const ranked = rankBoughtWith(pairs, NONE_TAKEN).map(({ sku }) => sku);

    expect(ranked).toEqual(["THE", "CAF", "JUS"]);
    expect(rankBoughtWith([...pairs].reverse(), NONE_TAKEN).map(({ sku }) => sku)).toEqual(ranked);
  });

  it("un article proposé par deux articles du panier vaut sa MEILLEURE paire, pas leur somme", () => {
    const cart = { inCart: ["CRO", "PAI"], taken: [] };

    const ranked = rankBoughtWith(
      [pair("CRO", "CAF", 5), pair("PAI", "CAF", 6), pair("CRO", "THE", 8)],
      cart,
    );

    expect(ranked).toEqual([
      { sku: "THE", withSku: "CRO" },
      { sku: "CAF", withSku: "PAI" },
    ]);
  });

  it("à égalité de soutien, l'article du panier départage", () => {
    const cart = { inCart: ["PAI", "CRO"], taken: [] };

    expect(rankBoughtWith([pair("PAI", "CAF", 7), pair("CRO", "CAF", 7)], cart)).toEqual([
      { sku: "CAF", withSku: "CRO" },
    ]);
  });

  it("ni ce qui est au panier, ni ce que le staff montre déjà", () => {
    const ranked = rankBoughtWith(
      [pair("CRO", "PAI", 9), pair("CRO", "CAF", 8), pair("CRO", "THE", 7)],
      { inCart: ["CRO", "PAI"], taken: ["CAF"] },
    );

    expect(ranked).toEqual([{ sku: "THE", withSku: "CRO" }]);
  });

  it("une paire dont l'article n'est pas au panier ne déclenche rien", () => {
    expect(rankBoughtWith([pair("BAG", "CAF", 9)], NONE_TAKEN)).toEqual([]);
  });
});
