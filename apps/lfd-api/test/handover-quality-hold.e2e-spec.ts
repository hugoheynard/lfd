import { randomUUID } from "node:crypto";
/**
 * E2E : **la retenue qualité au retrait** (plan
 * `documentation/production/plan-controle-qualite.md`, lot QC3, D4 et D6), sur
 * le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : le port publié par la production
 * (`QualityHoldsReader`) est relié par la racine de composition, lit le vrai
 * plan, et les TROIS lecteurs du retrait l'entendent — le geste (scan, saisie,
 * coursier), l'écran avant le geste, et la file.
 */
import type { HandoverQueueView, OrderHandoverView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { settleCardPayments } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { asCountedContainers } from "./production-day-fixture.js";

const MEMBER = "auth0|member-quality-hold";
const DAY = serviceDay();
const CROISSANT = "VIE-001";
const BAGUETTE = "PAI-001";
const HELD = "Commande en cours de vérification.";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_hold_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

let sequence = 0;
function ulid(): string {
  sequence += 1;
  return `01JQH${String(sequence).padStart(21, "0")}`;
}

type Lines = readonly { sku: string; quantity: number }[];

/** Passe et règle une commande pour le jour, et rend son id commerce. */
async function place(lines: Lines, fulfillment: "pickup" | "delivery" = "pickup"): Promise<string> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const pickupId =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  const where =
    fulfillment === "pickup"
      ? { pickupAddressId: pickupId }
      : { deliveryAddress: SITE, requestedWindow: { start: null, end: "10:00" } };
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: DAY,
        fulfillmentMethod: fulfillment,
        ...where,
        note: "",
        lines,
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

/** Colise une commande du plan : chaque ligne cochée, puis le bac fermé. */
async function pack(orderId: string): Promise<void> {
  const order = await ctx.prisma.productionOrder.findFirstOrThrow({
    where: { serviceDay: DAY, orderId },
    select: { reference: true, lines: { select: { sku: true } } },
  });
  for (const line of order.lines) {
    await staff()
      .put(`/admin/production/packing/${DAY}/sheets/${order.reference}/lines/${line.sku}`)
      .send({ initials: "MB" })
      .expect(204);
  }
  await staff().post(`/admin/production/batch/${DAY}/sheets/${order.reference}/packed`).expect(201);
}

/**
 * Le jour : deux retraits au comptoir portant des croissants (l'un colisé),
 * un retrait de baguettes seules, une livraison de croissants colisée — puis
 * la journée arrêtée.
 */
async function seedDay() {
  const croissants = await place([{ sku: CROISSANT, quantity: 12 }]);
  const mixed = await place([
    { sku: CROISSANT, quantity: 4 },
    { sku: BAGUETTE, quantity: 2 },
  ]);
  const baguettes = await place([{ sku: BAGUETTE, quantity: 3 }]);
  const delivery = await place([{ sku: CROISSANT, quantity: 6 }], "delivery");
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  // Un bac ne se remplit que de ce qui est sorti du four : la fournée d'abord.
  await staff()
    .put(`/admin/production/worksheet/${DAY}/lines/${CROISSANT}/done`)
    .send({ initials: "KA" })
    .expect(204);
  // Depuis K2, la journée naît au colisage : la liste à coliser et la remise
  // lui arrivent par la boîte d'envoi, hors de la requête.
  await ctx.drain();
  // K2b : ces commandes comptent leurs contenants (ancien écran) — le sujet
  // de la suite n'est pas le colisage, mais ce que la coche et le « + » déclenchent.
  await asCountedContainers(ctx, DAY);
  await pack(croissants);
  await pack(delivery);
  return { croissants, mixed, baguettes, delivery };
}

async function judge(
  target: { kind: "line"; sku: string } | { kind: "order"; orderId: string },
  verdict: "ok" | "blocking",
): Promise<void> {
  await staff()
    .post(`/admin/supervision/quality/checks`)
    .send({
      id: ulid(),
      serviceDay: DAY,
      target,
      verdict,
      note: verdict === "ok" ? null : "Brûlés",
      uploadIds: [],
    })
    .expect(201);
}

async function tokenAndReference(orderId: string) {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { handoverToken: true, orderNumber: true },
  });
  return { token: row.handoverToken ?? "", reference: row.orderNumber };
}

async function queue(): Promise<HandoverQueueView> {
  return jsonBody<HandoverQueueView>(
    await staff().get(`/admin/handover/file?jour=${DAY}`).expect(200),
  );
}

function heldOf(view: HandoverQueueView, orderId: string): boolean | undefined {
  return view.entries.find((entry) => entry.orderId === orderId)?.heldForQuality;
}

describe("un blocage de commande", () => {
  it("refuse le scan et la saisie avec la phrase, l'écran le dit ; un OK lève, le retrait passe", async () => {
    const { croissants } = await seedDay();
    const { token, reference } = await tokenAndReference(croissants);
    await judge({ kind: "order", orderId: croissants }, "blocking");

    const screen = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/${token}`).expect(200),
    );
    expect(screen.blockedReason).toBe(HELD);
    const scan = await staff().post(`/admin/handover/${token}`).expect(409);
    expect(jsonBody<{ message: string }>(scan).message).toBe(HELD);
    const manual = await staff().post(`/admin/handover/manual/${reference}`).expect(409);
    expect(jsonBody<{ message: string }>(manual).message).toBe(HELD);
    expect(heldOf(await queue(), croissants)).toBe(true);

    await judge({ kind: "order", orderId: croissants }, "ok");

    expect(heldOf(await queue(), croissants)).toBe(false);
    await staff().post(`/admin/handover/${token}`).expect(201);
  });
});

describe("un blocage de ligne (D6)", () => {
  it("retient toutes les commandes du plan portant le SKU — coursier compris — et elles seules", async () => {
    const { croissants, mixed, baguettes, delivery } = await seedDay();
    await judge({ kind: "line", sku: CROISSANT }, "blocking");

    const view = await queue();
    expect(heldOf(view, croissants)).toBe(true);
    expect(heldOf(view, mixed)).toBe(true);
    expect(heldOf(view, delivery)).toBe(true);
    expect(heldOf(view, baguettes)).toBe(false);

    // Le coursier scanne le code du destinataire : même porte, même refus.
    const courier = await staff()
      .post(`/admin/handover/${(await tokenAndReference(delivery)).token}`)
      .expect(409);
    expect(jsonBody<{ message: string }>(courier).message).toBe(HELD);
    const rail = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/order/${baguettes}`).expect(200),
    );
    expect(rail.blockedReason).toBeNull();
    await staff()
      .post(`/admin/handover/${(await tokenAndReference(baguettes)).token}`)
      .expect(201);
  });

  it("🔴 un sac déjà parti, puis retenu, dit « déjà retirée » — jamais « en vérification »", async () => {
    const { croissants } = await seedDay();
    const { token } = await tokenAndReference(croissants);
    await staff().post(`/admin/handover/${token}`).expect(201);

    await judge({ kind: "line", sku: CROISSANT }, "blocking");

    const replay = await staff().post(`/admin/handover/${token}`).expect(409);
    expect(jsonBody<{ message: string }>(replay).message).toBe(
      "Cette commande a déjà été retirée.",
    );
    const line = (await queue()).entries.find((entry) => entry.orderId === croissants);
    expect(line).toMatchObject({ state: "handed_over", heldForQuality: false });
  });
});
