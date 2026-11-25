import { PricingMaterialsCache } from "../../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import {
  backorderDecor,
  conversionBody,
  openBackorder,
  placeOrigin,
  quoteBackorder,
  SKU,
} from "../backorder-conversion-scene.js";
import { serviceDay } from "../e2e-harness.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

const CONTROLLER = "lafoliecoffee/orders/backorder/http/admin-backorders.controller.ts";

/** Le reliquat devient une commande (`commandes/reliquat/reliquat.md`). */
export const BACKORDER_SCENARIOS: ScenarioSet = {
  [routeKey(CONTROLLER, "convert")]: async ({ ctx }) => {
    ctx.app.get(PricingMaterialsCache).invalidate();
    const decor = await backorderDecor(ctx);
    const day = serviceDay(7);
    const originId = await placeOrigin(ctx, decor, day, [{ sku: SKU, quantity: 10 }]);
    const backorderId = await openBackorder(ctx, decor, originId, [
      { quantity: 4, saleUnit: "piece" },
    ]);
    const body = conversionBody(decor, day);
    const quoted = await quoteBackorder(ctx, backorderId, body);
    return {
      sub: STAFF,
      path: `/admin/backorders/${backorderId}/convert`,
      body: { ...body, expectedTotalCents: quoted.amounts?.totalCents ?? 0 },
    };
  },
};
