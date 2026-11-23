/**
 * **Une commande à régler à la caisse de la boutique**, notée au comptoir par
 * la vraie route — la mécanique de `counter-particular-order-readers.e2e-spec.ts`,
 * reprise pour l'export des ventes, qui la sert hors du CA. Elle est passée
 * maintenant : aucune route ne note une commande dans le passé.
 */
import type {
  AdminOrderEstimateView,
  CounterParticularPlacedOrderResponse,
  CreatedPickupResponse,
} from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ROUTE = "/admin/counter/particular-orders";

/** Note la commande d'un particulier au comptoir ; rend son numéro. */
export async function placedAtShopTill(ctx: E2eContext, particularId: string): Promise<string> {
  const staff = ctx.asSub(E2E_STAFF_SUB);
  const site = jsonBody<CreatedPickupResponse>(
    await staff
      .post("/admin/pickup-addresses")
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "La Boutique",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  const basket = {
    buyerUserId: particularId,
    fulfillmentMethod: "pickup",
    pickupAddressId: site,
    requestedDeliveryDate: serviceDay(),
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 6 }],
  };
  const seen = jsonBody<AdminOrderEstimateView>(
    await staff.post(`${ROUTE}/estimate`).send(basket).expect(200),
  );
  const placed = jsonBody<CounterParticularPlacedOrderResponse>(
    await staff
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ ...basket, expectedTotalCents: seen.amounts?.totalCents })
      .expect(201),
  );
  await ctx.drain();
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: placed.id },
    select: { orderNumber: true, settlementVenue: true },
  });
  if (row.settlementVenue !== "shop_till") {
    throw new Error("La commande notée au comptoir devait se régler à la caisse de la boutique.");
  }
  return row.orderNumber;
}
