import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { GetMyFavoritesHandler } from "../../queries/get-my-favorites.handler.js";
import { AddShopFavoriteCommand } from "../add-shop-favorite.command.js";
import { AddShopFavoriteHandler } from "../add-shop-favorite.handler.js";
import { RemoveShopFavoriteCommand } from "../remove-shop-favorite.command.js";
import { RemoveShopFavoriteHandler } from "../remove-shop-favorite.handler.js";
import { InMemoryShopFavorites } from "./shop-favorites-doubles.js";

const NOW = new Date();

function setup(): {
  readonly store: InMemoryShopFavorites;
  readonly add: AddShopFavoriteHandler;
  readonly remove: RemoveShopFavoriteHandler;
  readonly read: GetMyFavoritesHandler;
} {
  const store = new InMemoryShopFavorites();
  return {
    store,
    add: new AddShopFavoriteHandler(store, new FixedClock(NOW)),
    remove: new RemoveShopFavoriteHandler(store),
    read: new GetMyFavoritesHandler(store),
  };
}

describe("favoris de la boutique", () => {
  it("range le favori dans la société pour laquelle on agit, à l'instant de l'horloge", async () => {
    const { store, add } = setup();

    await add.execute(new AddShopFavoriteCommand("u1", "c1", "SKU-1"));

    expect(store.rows).toEqual([{ holder: { type: "company", id: "c1" }, sku: "SKU-1", at: NOW }]);
  });

  it("range le favori dans l'espace personnel sans société", async () => {
    const { store, add } = setup();

    await add.execute(new AddShopFavoriteCommand("u1", null, "SKU-1"));

    expect(store.rows[0]?.holder).toEqual({ type: "user", id: "u1" });
  });

  it("ne lit que les favoris de l'espace courant", async () => {
    const { add, read } = setup();
    await add.execute(new AddShopFavoriteCommand("u1", "c1", "SKU-SOCIETE"));
    await add.execute(new AddShopFavoriteCommand("u1", null, "SKU-PERSO"));

    expect(await read.execute({ userId: "u1", actingCompanyId: "c1" })).toEqual({
      skus: ["SKU-SOCIETE"],
    });
    expect(await read.execute({ userId: "u1", actingCompanyId: null })).toEqual({
      skus: ["SKU-PERSO"],
    });
  });

  it("retire le favori de l'espace courant seulement", async () => {
    const { store, add, remove } = setup();
    await add.execute(new AddShopFavoriteCommand("u1", "c1", "SKU-1"));
    await add.execute(new AddShopFavoriteCommand("u1", null, "SKU-1"));

    await remove.execute(new RemoveShopFavoriteCommand("u1", "c1", "SKU-1"));

    expect(store.rows.map((row) => row.holder)).toEqual([{ type: "user", id: "u1" }]);
  });

  it("retirer un absent ne fait rien", async () => {
    const { store, remove } = setup();

    await remove.execute(new RemoveShopFavoriteCommand("u1", null, "SKU-ABSENT"));

    expect(store.rows).toEqual([]);
  });
});
