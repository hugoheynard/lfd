import { shelfStockTodayPickupSchema } from "../shelf-stock-today.js";

describe("shelfStockTodayPickupSchema", () => {
  it("accepte un identifiant de point", () => {
    expect(shelfStockTodayPickupSchema.parse(" site_village ")).toBe("site_village");
  });

  it("refuse un point vide ou démesuré : une vitrine se lit toujours à un point", () => {
    expect(shelfStockTodayPickupSchema.safeParse("").success).toBe(false);
    expect(shelfStockTodayPickupSchema.safeParse("x".repeat(65)).success).toBe(false);
  });
});
