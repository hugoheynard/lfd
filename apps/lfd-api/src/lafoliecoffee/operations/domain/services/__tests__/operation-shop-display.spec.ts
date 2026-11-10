import { shopDisplayOf, type ShopDisplayInput } from "../operation-shop-display.js";

function display(over: Partial<ShopDisplayInput>) {
  return shopDisplayOf({
    hidden: false,
    archived: false,
    state: "open",
    sellingCount: 2,
    ...over,
  });
}

describe("shopDisplayOf — ce que verra le client", () => {
  it("rien pour une masquée, une archivée, une pas encore annoncée, une finie", () => {
    for (const over of [
      { hidden: true },
      { archived: true },
      { state: "preparing" as const },
      { state: "ended" as const },
    ]) {
      expect(display(over)).toEqual({ display: "nothing", awaitingProducts: false });
    }
  });

  it("l'encart et les articles tant qu'il y a des articles en vente", () => {
    expect(display({ state: "closed" }).display).toBe("announcement_and_products");
  });

  it("pendant l'annonce, l'encart seul ; commandes ouvertes, il attend ses produits", () => {
    expect(display({ state: "announced", sellingCount: 0 })).toEqual({
      display: "announcement_only",
      awaitingProducts: false,
    });
    expect(display({ sellingCount: 0 })).toEqual({
      display: "announcement_only",
      awaitingProducts: true,
    });
  });

  it("commandes closes sans article : rien — il n'y a rien à retirer", () => {
    expect(display({ state: "closed", sellingCount: 0 }).display).toBe("nothing");
  });
});
