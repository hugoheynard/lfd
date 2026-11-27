import { InMemoryShopFavorites } from "../../application/commands/__tests__/shop-favorites-doubles.js";
import { ShopFavoritesPlannerFavoriteSkus } from "../shop-favorites-planner-favorite-skus.js";

const AT = new Date("2026-12-01T08:00:00.000Z");

describe("ShopFavoritesPlannerFavoriteSkus", () => {
  it("rend les favoris de l'espace de la société, jamais ceux d'une personne ni d'une autre société", async () => {
    const store = new InMemoryShopFavorites();
    await store.add({ type: "company", id: "chalet" }, "CRO-01", AT);
    await store.add({ type: "company", id: "autre" }, "BAG-01", AT);
    await store.add({ type: "user", id: "chalet" }, "PERSO-01", AT);
    const reader = new ShopFavoritesPlannerFavoriteSkus(store);
    expect(await reader.skusOf("chalet")).toEqual(["CRO-01"]);
  });
});
