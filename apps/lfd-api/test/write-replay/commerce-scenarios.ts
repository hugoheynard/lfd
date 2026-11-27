import { createUser } from "../factories.js";
import { publishSalesTerms } from "../recurring-scene.js";
import { serviceDay } from "../e2e-harness.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { companyWithOwner, pickupPoint } from "./seeds.js";

const BUYER = "replay-buyer";

/** Les créations de commande, d'abonnement, de société, et la fidélité. */
export const COMMERCE_SCENARIOS: ScenarioSet = {
  [routeKey("lafoliecoffee/orders/http/admin-orders.controller.ts", "place")]: async ({ ctx }) => {
    const pickupId = await pickupPoint(ctx);
    const { companyId, ownerId } = await companyWithOwner(ctx, BUYER, true);
    return {
      sub: STAFF,
      path: "/admin/orders",
      body: {
        companyId,
        buyerUserId: ownerId,
        settlement: "account",
        requestedDeliveryDate: serviceDay(),
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: "VIE-001-1", quantity: 12 }],
      },
    };
  },

  [routeKey("recurring/basket/http/subscriptions.controller.ts", "create")]: async ({ ctx }) => {
    // Un panier ne s'ouvre pas sans CGV publiées pour sa clientèle.
    await publishSalesTerms(ctx);
    await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa", lastName: "Martin" });
    return {
      sub: BUYER,
      path: "/subscriptions",
      body: {
        fromOrderId: null,
        recurrence: "weekly",
        startDate: serviceDay(),
        endDate: null,
        fulfillmentMethod: "pickup",
        deliveryAddress: null,
        pickupAddressId: null,
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: "VIE-001-1", quantity: 3 }],
        note: "",
      },
    };
  },

  [routeKey("recurring/planned/http/planner.controller.ts", "open")]: async ({ ctx }) => {
    // Un pro rattaché à une seule société agit pour elle sans en-tête d'espace.
    await companyWithOwner(ctx, BUYER, true);
    return {
      sub: BUYER,
      path: "/planner/columns",
      body: {
        day: serviceDay(2),
        routing: {
          method: "pickup",
          deliveryAddress: null,
          pickupAddressId: null,
          window: { start: "07:00", end: "09:00" },
        },
      },
    };
  },

  [routeKey("lafoliecoffee/account/http/companies.controller.ts", "create")]: async ({ ctx }) => {
    await createUser(ctx.prisma, {
      auth0Sub: BUYER,
      email: "camille@replay.test",
      firstName: "Camille",
      lastName: "Rousseau",
      phone: "",
    });
    return {
      sub: BUYER,
      path: "/companies",
      body: {
        raisonSociale: "Boulangerie du Marais SAS",
        enseigne: "Le Pain du Marais",
        formeJuridique: "SAS",
        siret: "812 456 789 00021",
        vatNumber: "FR66812456789",
      },
    };
  },

  [routeKey("lafoliecoffee/loyalty/http/admin-loyalty.controller.ts", "adjust")]: async ({
    ctx,
  }) => {
    const user = await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa" });
    return {
      sub: STAFF,
      path: "/admin/loyalty/adjustments",
      body: {
        holderKind: "user",
        holderId: user.id,
        points: 40,
        reason: "reprise du carnet papier",
      },
    };
  },
};
