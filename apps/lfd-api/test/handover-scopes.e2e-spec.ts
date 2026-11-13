import { randomUUID } from "node:crypto";
/**
 * E2E des **périmètres de la journée du retrait** — une route par usage
 * (décidé par Hugo le 2026-11-13), sur le vrai Postgres jetable.
 *
 * - `admin/handover/file` (`handover_counter`) ne sert AUCUNE livraison, ni
 *   donc aucune tournée — matière de `delivery_rounds` ;
 * - `admin/supervision/handover` (`b2b_supervision`) sert la journée entière ;
 * - `admin/cockpit/handovers` (`b2b_growth`, le droit du cockpit) ne rend que
 *   les compteurs, retraits et livraisons comptés à part.
 *
 * Les droits sont posés par DÉROGATION sur une fiche `communication`, qui
 * n'en tient aucun des trois par son rôle.
 */
import type { CockpitHandoversView, HandoverQueueView, StaffResource } from "@lfd/contracts";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { settleCardPayments } from "./card-payments.js";
import { cardGatewayDouble } from "./order-factory.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { addVehicle, assign, openRound } from "./delivery-rounds-scene.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|scopes-owner";
const COUNTER_ONLY = "staff-comptoir-seul";
const GROWTH_ONLY = "staff-cockpit-seul";
const WITHOUT_RIGHT = "staff-sans-droit";
const DAY = serviceDay();

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const SPECS = {
  note: "",
  slotList: { mode: "everyday", slots: [] },
  windowMode: "deadline",
  deadlines: { mode: "everyday", times: ["10:00"] },
  deliveryContact: { prenom: "Camille", nom: "Rousseau", telephone: "0142710844" },
  gps: { lat: 45.448, lng: 6.98 },
  signatureRequired: false,
  stopMinutes: 20,
};

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const fakeGateway = cardGatewayDouble("pi_e2e_scopes");
const issuedIntents = fakeGateway.provider.issued;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  await ctx.prisma.site.create({ data: { ...SITE, isDefault: true } });
});

/** Une fiche `communication`, à qui l'on ouvre en lecture les ressources données. */
async function staffWith(sub: string, resources: readonly StaffResource[]): Promise<void> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "communication",
      status: "active",
      auth0Id: sub,
    },
  });
  for (const resource of resources) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: row.id, resource, action: "read", effect: "allow" },
    });
  }
}

/** Une société active, son gestionnaire, une adresse de livraison au carnet. */
async function seedCompany(): Promise<string> {
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const company = await createCompany(ctx.prisma, { status: "active", raisonSociale: "Le Col" });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const address = await ctx.prisma.address.create({
    data: {
      ...SITE,
      companyId: company.id,
      kind: "delivery",
      isDefault: true,
      deliverySpecs: SPECS,
    },
    select: { id: true },
  });
  return address.id;
}

/** Passe et règle une commande du jour ; rend son id commerce. */
async function place(fulfillment: "pickup" | "delivery", addressId: string): Promise<string> {
  const point = await ctx.prisma.site.findFirstOrThrow({ select: { id: true } });
  const where =
    fulfillment === "pickup"
      ? { pickupAddressId: point.id, requestedWindow: { start: "07:00", end: "08:00" } }
      : {
          deliveryAddress: SITE,
          deliveryAddressId: addressId,
          requestedWindow: { start: null, end: "10:00" },
        };
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(OWNER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        requestedDeliveryDate: DAY,
        fulfillmentMethod: fulfillment,
        ...where,
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 4 }],
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issuedIntents);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true },
  });
  return row.id;
}

/** Un retrait et une livraison placée dans une tournée. */
async function seedDay(): Promise<{ pickup: string; delivery: string }> {
  const addressId = await seedCompany();
  const pickup = await place("pickup", addressId);
  const delivery = await place("delivery", addressId);
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo blanc"));
  await assign(ctx, DAY, roundId, delivery);
  return { pickup, delivery };
}

describe("la file du comptoir — handover_counter sans delivery_rounds", () => {
  /**
   * Régression : la file du comptoir envoyait les livraisons et leur tournée,
   * matière de `delivery_rounds`, à qui ne tient que `handover_counter`.
   */
  it("🔴 ne sert aucune livraison, ni aucune tournée", async () => {
    await staffWith(COUNTER_ONLY, ["handover_counter"]);
    const { pickup } = await seedDay();

    const queue = jsonBody<HandoverQueueView>(
      await ctx.asSub(COUNTER_ONLY).get(`/admin/handover/file?jour=${DAY}`).expect(200),
    );

    expect(queue.entries.map((entry) => entry.orderId)).toEqual([pickup]);
    expect(queue.entries.every((entry) => entry.fulfillmentMethod === "pickup")).toBe(true);
    expect(queue.entries.every((entry) => entry.round === null)).toBe(true);
  });
});

describe("la file de la Supervision", () => {
  it("garde la journée entière, la livraison avec sa tournée", async () => {
    const { pickup, delivery } = await seedDay();

    const queue = jsonBody<HandoverQueueView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/supervision/handover?jour=${DAY}`).expect(200),
    );
    const byId = new Map(queue.entries.map((entry) => [entry.orderId, entry]));

    expect([...byId.keys()].sort()).toEqual([pickup, delivery].sort());
    expect(byId.get(delivery)?.round).toMatchObject({ label: "Kangoo blanc", position: 1 });
  });
});

describe("les remises du cockpit commercial", () => {
  it("rend les chiffres du jour sous b2b_growth, retraits et livraisons à part", async () => {
    await staffWith(GROWTH_ONLY, ["b2b_growth"]);
    await seedDay();

    const view = jsonBody<CockpitHandoversView>(
      await ctx.asSub(GROWTH_ONLY).get(`/admin/cockpit/handovers?jour=${DAY}`).expect(200),
    );

    expect(view).toEqual({
      day: DAY,
      pickup: { expected: 1, done: 0 },
      delivery: { expected: 1, done: 0 },
    });
  });

  it("refuse sans b2b_growth (403), même avec handover_counter", async () => {
    await staffWith(WITHOUT_RIGHT, ["handover_counter"]);

    await ctx.asSub(WITHOUT_RIGHT).get(`/admin/cockpit/handovers?jour=${DAY}`).expect(403);
  });

  it("refuse un jour mal formé (400)", async () => {
    await staffWith(GROWTH_ONLY, ["b2b_growth"]);

    await ctx.asSub(GROWTH_ONLY).get(`/admin/cockpit/handovers?jour=demain`).expect(400);
  });
});
