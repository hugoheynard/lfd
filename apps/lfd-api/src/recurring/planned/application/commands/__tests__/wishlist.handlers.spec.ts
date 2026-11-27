import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedStanding } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import { PlannerProOnlyError } from "../../../domain/errors/planned-column-errors.js";
import { PlannerWall } from "../../services/planner-wall.js";
import { InMemoryWishlist } from "../../__tests__/planner-doubles.js";
import { AddWishlistItemCommand } from "../add-wishlist-item.command.js";
import { AddWishlistItemHandler } from "../add-wishlist-item.handler.js";
import { RemoveWishlistItemCommand } from "../remove-wishlist-item.command.js";
import { RemoveWishlistItemHandler } from "../remove-wishlist-item.handler.js";

const NOW = new Date("2026-12-01T08:00:00.000Z");

function scene() {
  const wishlist = new InMemoryWishlist();
  const wall = new PlannerWall(new FixedStanding(new Set(["user_1/chalet", "user_1/autre"])));
  return {
    wishlist,
    add: new AddWishlistItemHandler(wall, wishlist, new FixedClock(NOW)),
    remove: new RemoveWishlistItemHandler(wall, wishlist),
  };
}

describe("la liste d'envies", () => {
  it("une par personne et par société : un ajout dans une société ne paraît pas dans l'autre", async () => {
    const { add, wishlist } = scene();
    await add.execute(new AddWishlistItemCommand("user_1", "chalet", "CRO-01"));
    await add.execute(new AddWishlistItemCommand("user_1", "chalet", "CRO-01"));
    expect(await wishlist.itemsOf("user_1", "chalet")).toHaveLength(1);
    expect(await wishlist.itemsOf("user_1", "autre")).toEqual([]);
  });

  it("retire l'article ; retirer un absent ne change rien", async () => {
    const { add, remove, wishlist } = scene();
    await add.execute(new AddWishlistItemCommand("user_1", "chalet", "CRO-01"));
    await remove.execute(new RemoveWishlistItemCommand("user_1", "chalet", "CRO-01"));
    await remove.execute(new RemoveWishlistItemCommand("user_1", "chalet", "CRO-01"));
    expect(wishlist.rows).toEqual([]);
  });

  it("refuse l'espace personnel (403)", async () => {
    await expect(
      scene().add.execute(new AddWishlistItemCommand("user_1", null, "CRO-01")),
    ).rejects.toThrow(PlannerProOnlyError);
  });
});
