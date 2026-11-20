import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecognisedShelf } from "../../../../catalog/application/recognised-shelf.service.js";
import {
  SHELF_NOW,
  shelfComputation,
} from "../../../../catalog/application/__tests__/recognised-shelf-fixture.js";
import { resilientAround } from "../../../../catalog/application/__tests__/shelf-cache-doubles.js";
import { NoShopShelfCache } from "../../../../catalog/infrastructure/no-shop-shelf-cache.js";
import { ReadCounterParticularShelfPricesHandler } from "../read-counter-particular-shelf-prices.js";

function rig() {
  const computation = shelfComputation();
  const shelf = new RecognisedShelf(
    computation.pricing,
    resilientAround(new NoShopShelfCache()).resilient,
    new FixedClock(SHELF_NOW),
  );
  return { handler: new ReadCounterParticularShelfPricesHandler(shelf), shelf, computation };
}

describe("ReadCounterParticularShelfPricesHandler — le rayon d'un particulier, au comptoir", () => {
  it("reprend, SKU par SKU, le rayon qu'un particulier connecté lit (clé sans société)", async () => {
    const { handler, shelf } = rig();

    const table = await handler.execute();
    const view = await shelf.read(null);

    expect(table.audience).toBe("public");
    expect(table.items).toEqual(
      view.items.map((item) => ({
        sku: item.sku,
        unitPriceMillicents: item.unitPriceMillicents,
        struckFromMillicents: item.catalogPriceMillicents ?? null,
        unitPriceTtcCents: item.unitPriceTtcCents,
        struckFromTtcCents: item.catalogPriceTtcCents ?? null,
        lockedReason: item.lockedReason ?? null,
      })),
    );
  });

  it("ne porte aucun prix négocié : la mercuriale d'une société n'atteint pas le particulier", async () => {
    const { handler } = rig();

    const table = await handler.execute();

    expect(table.items.length).toBeGreaterThan(0);
    expect(table.items.some((item) => item.unitPriceMillicents === 150_000)).toBe(false);
    expect(table.items.every((item) => item.struckFromMillicents === null)).toBe(true);
  });
});
