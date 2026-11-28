import {
  localToInstant,
  type AdminOrderEstimateView,
  type CounterParticularPlacedOrderResponse,
} from "@lfd/contracts";

import { jsonBody, serviceDay } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, staffOf, type ReplayWorld, type ScenarioSet } from "./scenario.js";
import { pickupPoint } from "./seeds.js";

const ORDERS = "/admin/counter/particular-orders";
const WINDOW = { start: "07:00", end: "08:00" };
const MINUTE_MS = 60_000;
const AFTER_SLOT_MINUTES = 30;

/** Le panier d'un particulier inscrit, au point de retrait par défaut. */
async function particularBasket(world: ReplayWorld): Promise<Record<string, unknown>> {
  const site = await pickupPoint(world.ctx);
  const particular = await createUser(world.ctx.prisma, {
    auth0Sub: "auth0|replay-particulier",
    email: "replay.particulier@test.fr",
  });
  const basket = {
    buyerUserId: particular.id,
    fulfillmentMethod: "pickup",
    pickupAddressId: site,
    requestedDeliveryDate: serviceDay(),
    requestedWindow: WINDOW,
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 6 }],
  };
  const seen = jsonBody<AdminOrderEstimateView>(
    await staffOf(world.ctx)().post(`${ORDERS}/estimate`).send(basket).expect(200),
  );
  return { ...basket, expectedTotalCents: seen.amounts?.totalCents };
}

/** Une commande à régler en boutique, son créneau passé à l'horloge du scénario. */
async function overdueParticularOrder(world: ReplayWorld): Promise<string> {
  const basket = await particularBasket(world);
  const placed = jsonBody<CounterParticularPlacedOrderResponse>(
    await staffOf(world.ctx)().post(ORDERS).set(INTENT_KEY, freshIntent()).send(basket).expect(201),
  );
  const end = localToInstant(serviceDay(), WINDOW.end);
  if (end === null) {
    throw new Error(`Fin de créneau illisible le ${serviceDay()}.`);
  }
  world.clock.set(new Date(end.getTime() + AFTER_SLOT_MINUTES * MINUTE_MS));
  return placed.id;
}

/** La saisie d'un particulier au comptoir et la commande non retirée. */
export const COUNTER_SCENARIOS: ScenarioSet = {
  [routeKey("lafoliecoffee/account/http/admin-counter-particulars.controller.ts", "register")]:
    () =>
      Promise.resolve({
        sub: STAFF,
        path: "/admin/counter/particulars",
        body: { firstName: "Léa", email: "lea.replay@test.fr", phone: "0611223344" },
      }),

  [routeKey("lafoliecoffee/account/http/admin-counter-accounts.controller.ts", "open")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/counter/accounts",
      body: {
        enseigne: "Le Bistrot du rejeu",
        contact: {
          firstName: "Paul",
          lastName: "Rejeu",
          email: "paul.rejeu@test.fr",
          phone: "0611223355",
        },
        identitySeen: true,
      },
    }),

  [routeKey("lafoliecoffee/orders/http/admin-counter-particular-orders.controller.ts", "place")]:
    async (world) => ({ sub: STAFF, path: ORDERS, body: await particularBasket(world) }),

  [routeKey(
    "lafoliecoffee/orders/http/admin-offered-particular-orders.controller.ts",
    "placeForParticular",
  )]: async (world) => {
    const { expectedTotalCents: _paid, ...basket } = await particularBasket(world);
    return {
      sub: STAFF,
      path: "/admin/offered-orders/particular",
      body: {
        ...basket,
        offer: { nature: "event", note: "Dégustation", notifyCustomer: false },
        expectedTotalCents: 0,
      },
    };
  },

  [routeKey("lafoliecoffee/orders/http/admin-counter-no-show.controller.ts", "declareNoShow")]:
    async (world) => ({
      sub: STAFF,
      path: `${ORDERS}/${await overdueParticularOrder(world)}/no-show`,
      body: {},
    }),

  [routeKey("lafoliecoffee/orders/http/admin-counter-no-show.controller.ts", "requestNotice")]:
    async (world) => {
      const orderId = await overdueParticularOrder(world);
      await staffOf(world.ctx)()
        .post(`${ORDERS}/${orderId}/no-show`)
        .set(INTENT_KEY, freshIntent())
        .send({})
        .expect(204);
      return { sub: STAFF, path: `${ORDERS}/${orderId}/no-show-notice`, body: {} };
    },
};
