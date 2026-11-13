import { randomUUID } from "node:crypto";
/**
 * E2E de la **file du retrait servie par l'objet des journées**
 * (`le-cache-du-back-office.md`, § 3.4), clés `handover-counter` et
 * `handover-day` — sans objet ici (`NoDayContentsCache`, aucune URL d'objet en
 * e2e) : ce qui se prouve est le câblage réel, numéros `orders`,
 * `production`, `delivery` et `companies` lus en base avant les tables.
 *
 * - un retrait, puis une relecture immédiate, rend la ligne retirée ;
 * - une enseigne corrigée, puis une relecture immédiate, rend le nouveau nom ;
 * - le comptoir garde sa file sans livraison après une lecture de la journée.
 */
import type { HandoverQueueView } from "@lfd/contracts";

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

const OWNER = "auth0|queue-contents-owner";
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

const fakeGateway = cardGatewayDouble("pi_e2e_queue_contents");
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

/** Une société active, son gestionnaire, une adresse de livraison au carnet. */
async function seedCompany(): Promise<{ companyId: string; addressId: string }> {
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
  return { companyId: company.id, addressId: address.id };
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
async function seedDay(): Promise<{ pickup: string; delivery: string; companyId: string }> {
  const { companyId, addressId } = await seedCompany();
  const pickup = await place("pickup", addressId);
  const delivery = await place("delivery", addressId);
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo blanc"));
  await assign(ctx, DAY, roundId, delivery);
  return { pickup, delivery, companyId };
}

async function queueOf(path: string): Promise<HandoverQueueView> {
  return jsonBody<HandoverQueueView>(
    await ctx.asSub(E2E_STAFF_SUB).get(`${path}?jour=${DAY}`).expect(200),
  );
}

const COUNTER = "/admin/handover/file";
const WHOLE_DAY = "/admin/supervision/handover";

describe("la file servie par l'objet des journées", () => {
  it("rend un retrait saisi, relu aussitôt, aux deux périmètres", async () => {
    const { pickup } = await seedDay();
    expect((await queueOf(COUNTER)).entries[0]?.state).not.toBe("handed_over");
    await queueOf(WHOLE_DAY);
    const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: pickup },
      select: { orderNumber: true },
    });

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/handover/manual/${orderNumber}`)
      .send({})
      .expect(201);

    const counter = await queueOf(COUNTER);
    const day = await queueOf(WHOLE_DAY);
    expect(counter.entries.find((line) => line.orderId === pickup)?.state).toBe("handed_over");
    expect(day.entries.find((line) => line.orderId === pickup)?.state).toBe("handed_over");
  });

  it("rend une enseigne corrigée, relue aussitôt — le numéro `companies` entre dans la clé", async () => {
    const { companyId } = await seedDay();
    await queueOf(WHOLE_DAY);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .patch(`/admin/companies/${companyId}/identity`)
      .send({ enseigne: "Le Refuge du Col" })
      .expect(204);

    const day = await queueOf(WHOLE_DAY);
    expect(day.entries.every((line) => line.tradeName === "Le Refuge du Col")).toBe(true);
  });

  it("🔴 garde le comptoir sans livraison, lu après la journée entière", async () => {
    const { pickup, delivery } = await seedDay();

    const day = await queueOf(WHOLE_DAY);
    const counter = await queueOf(COUNTER);

    expect(day.entries.map((line) => line.orderId).sort()).toEqual([pickup, delivery].sort());
    expect(counter.entries.map((line) => line.orderId)).toEqual([pickup]);
    expect(counter.entries.every((line) => line.round === null)).toBe(true);
  });
});
