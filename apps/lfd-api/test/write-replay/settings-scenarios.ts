import { CustomerRole } from "../../src/platform/database/client/client.js";
import { addNote } from "../client-notes-scene.js";
import { jsonBody, serviceDay, type E2eContext } from "../e2e-harness.js";
import { attachTo, createCompany, createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { promotionTerms } from "../promotion-fixtures.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

const COMMERCE = "lafoliecoffee";
const CLIENT = "replay-client";

const SITE = {
  label: "Chalet du Village",
  ligne1: "1 place du Village",
  ligne2: "",
  codePostal: "73150",
  ville: "Val-d'Isère",
  pays: "France",
};

/** Un site posé par la route. */
async function site(ctx: E2eContext): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post("/admin/sites")
    .set(INTENT_KEY, freshIntent())
    .send(SITE)
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Les réglages du staff : zones, points, sites, promotions, suggestions, notes, véhicules. */
export const SETTINGS_SCENARIOS: ScenarioSet = {
  [routeKey(`${COMMERCE}/delivery-zones/http/admin-delivery-zones.controller.ts`, "create")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/delivery-zones",
      body: {
        label: "Val d'Isère",
        postalPrefixes: ["73150"],
        fee: { mode: "amount", cents: 2_000 },
      },
    }),

  [routeKey(`${COMMERCE}/pickup-addresses/http/admin-pickup-addresses.controller.ts`, "create")]:
    () =>
      Promise.resolve({
        sub: STAFF,
        path: "/admin/pickup-addresses",
        body: {
          label: "Boutique Oberkampf",
          ligne1: "5 rue du Four",
          ligne2: "",
          codePostal: "75011",
          ville: "Paris",
          pays: "France",
          discounts: { b2b: null, b2c: null },
        },
      }),

  [routeKey(`${COMMERCE}/sites/http/admin-sites.controller.ts`, "create")]: () =>
    Promise.resolve({ sub: STAFF, path: "/admin/sites", body: SITE }),

  [routeKey(`${COMMERCE}/sites/http/admin-site-tables.controller.ts`, "generateQr")]: async ({
    ctx,
  }) => {
    const id = await site(ctx);
    await ctx
      .asSub(STAFF)
      .put(`/admin/sites/${id}/roles`)
      .send({
        pickup: true,
        supply: "on_site",
        deliveryDeparture: false,
        transferMode: "integrated",
        counterSetupMinutes: 0,
        eatIn: true,
      })
      .expect(204);
    await ctx.asSub(STAFF).put(`/admin/sites/${id}/tables`).send({ count: 2 }).expect(204);
    return { sub: STAFF, path: `/admin/sites/${id}/tables/1/qr` };
  },

  [routeKey(`${COMMERCE}/promotions/http/admin-promotions.controller.ts`, "pose")]: () =>
    Promise.resolve({ sub: STAFF, path: "/admin/promotions", body: promotionTerms() }),

  [routeKey(`${COMMERCE}/recommendations/http/admin-staff-suggestions.controller.ts`, "create")]:
    () =>
      Promise.resolve({
        sub: STAFF,
        path: "/admin/suggestions",
        body: {
          trigger: { kind: "product_in_cart", ref: "VIE-001-1" },
          suggestedSkus: ["PAI-001-1"],
          placement: "cart",
          audience: "both",
          startsOn: serviceDay(0),
          endsOn: serviceDay(7),
          phrase: null,
          priority: 0,
        },
      }),

  [routeKey(`${COMMERCE}/client-notes/http/admin-client-notes.controller.ts`, "add")]: async ({
    ctx,
  }) => {
    const company = await createCompany(ctx.prisma);
    return {
      sub: STAFF,
      path: `/admin/companies/${company.id}/notes`,
      fields: { title: "Visite", body: "Le gérant veut 30 brioches le mardi" },
    };
  },

  [routeKey(`${COMMERCE}/client-notes/http/admin-client-notes.controller.ts`, "revise")]: async ({
    ctx,
  }) => {
    const company = await createCompany(ctx.prisma);
    const noteId = await addNote(ctx.asSub(STAFF), company.id, "Visite", null);
    return {
      sub: STAFF,
      path: `/admin/companies/${company.id}/notes/${noteId}`,
      fields: { title: "Visite du mardi", body: "Le gérant veut 30 brioches le mardi" },
    };
  },

  [routeKey(`${COMMERCE}/account/http/support.controller.ts`, "request")]: async ({ ctx }) => {
    const member = await createUser(ctx.prisma, { auth0Sub: CLIENT });
    const company = await createCompany(ctx.prisma, { status: "pending" });
    await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
    return {
      sub: CLIENT,
      path: "/support/activation",
      body: {
        companyId: company.id,
        channel: "phone",
        purpose: "discover",
        phoneNumber: "0600000000",
        asap: true,
        scheduledDate: null,
        slot: null,
        message: "Besoin d'aide sur le KBIS",
      },
    };
  },

  [routeKey("delivery/http/vehicles.controller.ts", "add")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/delivery/vehicles",
      body: { name: "Kangoo gris", plate: "AB-101-CD" },
    }),

  [routeKey("staff/directory/http/admin-staff-users.controller.ts", "create")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/staff-users",
      body: {
        firstName: "Claire",
        lastName: "Martin",
        email: "martin@lfc.test",
        role: "commercial",
      },
    }),
};
