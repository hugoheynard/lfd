/**
 * 🔴 **L'estimation de la saisie = la commande qu'elle annonce** (plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2).
 *
 * La même saisie passe par `POST /admin/orders/estimate`, puis par
 * `POST /admin/orders` ; chaque montant estimé est comparé aux COLONNES de la
 * commande écrite — ce qu'une facture relira —, pas à une seconde réponse
 * HTTP. Et l'estimation n'écrit rien : les lignes en base sont comptées avant
 * et après.
 *
 * Cinq saisies, celles que le plan nomme : retrait (remise pro), coursier
 * (frais de zone), retrait immédiat (sur stock), dérogation à l'heure limite
 * (supplément et sa TVA), règlement au compte (accordé, puis refusé).
 *
 * Deux frontières doublées : la signature du jeton et la passerelle Stripe.
 * L'horloge est fixée à midi aujourd'hui (Paris) : le retrait immédiat et
 * l'heure limite se calent dessus, jamais sur une date écrite.
 */
import {
  addDays,
  instantToLocal,
  localToInstant,
  type AdminOrderEstimateView,
  type BillingAddressPayload,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_est", clientSecret: "pi_est_secret" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_est",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const MINUTE_MS = 60_000;
const CROISSANT = "VIE-001-1";
/** Deux taux et deux quantités : la forme qui casse une ventilation fausse. */
const PANIER = [
  { sku: CROISSANT, quantity: 3 },
  { sku: "PAI-001-1", quantity: 2 },
] as const;

const COURIER_ADDR: BillingAddressPayload = {
  label: "Restaurant",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Midi aujourd'hui à Paris. */
function todayAt(time: string): Date {
  return localToInstant(instantToLocal(new Date()).day, time) ?? new Date();
}

const clock = new FixedClock(todayAt("12:00"));
let ctx: E2eContext;
let siteId = "";
let addressId = "";
let pro = { companyId: "", buyerUserId: "" };

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: clock },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(todayAt("12:00"));
  siteId = await seedShop();
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2_000 },
  });
  await staff().patch("/admin/order-cutoff-settings").send({ sameDayProAllowed: true }).expect(204);
  pro = await seedPro(true);
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);
const today = () => instantToLocal(clock.now()).day;

/** Une boutique qui remet 20 % aux pros, dix croissants reçus aujourd'hui. */
async function seedShop(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Boutique du Centre",
      ligne1: "1 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  await poseSiteDiscount(staff(), site.id, { b2b: { mode: "percent", value: 2_000 } });
  await staff()
    .post(`/admin/resupply-receipts/${site.id}/${today()}/lines`)
    .send({ sku: CROISSANT, quantity: 10 })
    .expect(204);
  return site.id;
}

/** Un pro actif, au crédit accordé ou non, et une adresse de livraison livrée à 10:00. */
async function seedPro(credited: boolean): Promise<typeof pro> {
  const key = credited ? "pro-credit" : "pro-sans-credit";
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  if (credited) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: ["monthly"] },
    });
  }
  const buyer = await createUser(ctx.prisma, { auth0Sub: `auth0|${key}`, email: `${key}@p2.fr` });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  const address = await ctx.prisma.address.create({
    data: {
      ...COURIER_ADDR,
      companyId: company.id,
      kind: "delivery",
      isDefault: true,
      // Inscrite, comme par le commercial : un pro — et l'équipe pour lui
      // depuis E1 — ne demande qu'une échéance inscrite sur son adresse.
      deliverySpecs: {
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        signatureRequired: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: ["10:00"] },
      },
    },
    select: { id: true },
  });
  addressId = address.id;
  return { companyId: company.id, buyerUserId: buyer.id };
}

function pickupBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...pro,
    settlement: "account",
    requestedDeliveryDate: serviceDay(),
    fulfillmentMethod: "pickup",
    pickupAddressId: siteId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [...PANIER],
    ...over,
  };
}

/** Ce qui s'écrit à la passation : si l'estimation y touchait, un compte bougerait. */
async function writtenRows(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.order.count(),
    ctx.prisma.orderLine.count(),
    ctx.prisma.orderCutoffWaiver.count({ where: { usedAt: { not: null } } }),
  ]);
}

async function estimate(body: Record<string, unknown>): Promise<AdminOrderEstimateView> {
  const before = await writtenRows();
  const view = jsonBody<AdminOrderEstimateView>(
    await staff().post("/admin/orders/estimate").send(body).expect(200),
  );
  await ctx.drain();
  expect(await writtenRows()).toEqual(before);
  return view;
}

/**
 * 🔴 **Le cœur du fichier** : la même saisie, estimée puis passée, et CHAQUE
 * montant comparé aux colonnes — le total seul laisserait passer une remise
 * trop forte compensée par des frais trop élevés.
 */
async function expectParity(body: Record<string, unknown>): Promise<AdminOrderEstimateView> {
  const view = await estimate(body);
  expect(view.refusal).toBeNull();
  const placed = await staff().post("/admin/orders").send(body);
  expect({
    status: placed.status,
    body: placed.status === 201 ? null : (placed.body as unknown),
  }).toEqual({
    status: 201,
    body: null,
  });
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: jsonBody<{ id: string }>(placed).id },
    select: {
      subtotalCents: true,
      discountCents: true,
      deliveryFeeCents: true,
      lateFeeCents: true,
      vatCents: true,
      totalCents: true,
      lines: { select: { sku: true, lineTotalCents: true }, orderBy: { sku: "asc" } },
    },
  });
  const amounts = view.amounts;
  expect({
    subtotalCents: amounts?.subtotalCents,
    discountCents: amounts?.discountCents,
    deliveryFeeCents: amounts?.deliveryFeeCents,
    lateFeeCents: amounts?.lateFeeCents,
    vatCents: amounts?.vatCents,
    totalCents: amounts?.totalCents,
    lines: [...(amounts?.lines ?? [])]
      .map((line) => ({ sku: line.sku, lineTotalCents: line.lineTotalCents }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  }).toEqual(order);
  return view;
}

describe("l'estimation de la saisie et la commande passée", () => {
  it("🔴 s'accordent au centime en RETRAIT, remise pro comprise", async () => {
    const view = await expectParity(pickupBody());

    // La remise doit JOUER, sans quoi l'égalité se vérifierait sur zéro.
    expect(view.amounts?.discountCents).toBeGreaterThan(0);
    expect(view.amounts?.discounts).toHaveLength(1);
    // Le tarif d'entrée de la résolution, par ligne : le prix barré du panier.
    expect(view.amounts?.lines.every((line) => line.basePriceMillicents !== null)).toBe(true);
  });

  it("🔴 s'accordent au centime en COURSIER, frais de zone compris", async () => {
    const view = await expectParity(
      pickupBody({
        fulfillmentMethod: "delivery",
        pickupAddressId: null,
        deliveryAddressId: addressId,
        deliveryAddress: COURIER_ADDR,
        requestedWindow: { start: null, end: "10:00" },
      }),
    );

    expect(view.amounts?.deliveryFeeCents).toBe(2_000);
  });

  it("🔴 s'accordent au centime en RETRAIT IMMÉDIAT, sur stock", async () => {
    const view = await expectParity(
      pickupBody({
        supply: "shelf",
        entryShortcut: "immediate_pickup",
        requestedDeliveryDate: today(),
        requestedWindow: { start: "12:00", end: "13:00" },
        lines: [{ sku: CROISSANT, quantity: 3 }],
      }),
    );

    expect(view.warnings).toEqual([]);
  });

  it("🔴 s'accordent au centime sur une DÉROGATION, supplément et sa TVA compris", async () => {
    await staff()
      .put("/admin/order-late-fee")
      .send({ fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 })
      .expect(204);
    // Une limite tombée il y a dix minutes, quarante-cinq de rattrapage : le
    // jour demandé est en grâce, et seule la dérogation laisse passer.
    const limit = instantToLocal(new Date(clock.now().getTime() - 10 * MINUTE_MS));
    await ctx.prisma.orderCutoff.create({
      data: {
        pickupAddressId: null,
        weekday: null,
        daysBefore: 2,
        time: limit.time,
        graceMinutes: 45,
      },
    });
    const day = addDays(limit.day, 2);
    await staff()
      .post("/admin/order-cutoff-waivers")
      .send({ companyId: pro.companyId, fulfillmentDate: day, reason: "Client bloqué en tournée" })
      .expect(201);

    const view = await expectParity(pickupBody({ requestedDeliveryDate: day }));

    expect(view.amounts).toMatchObject({ lateFeeCents: 500, lateFeeVatRatePercent: 20 });
    expect(view.cutoff?.status).toBe("grace");
  });

  it("au compte sans crédit : l'estimation avertit, la passation refuse, avec les mêmes mots", async () => {
    pro = await seedPro(false);
    const body = pickupBody();

    const view = await estimate(body);
    const refused = await staff().post("/admin/orders").send(body).expect(409);

    expect(view.amounts).not.toBeNull();
    expect(view.warnings).toEqual([
      {
        code: jsonBody<{ code: string }>(refused).code,
        message: jsonBody<{ message: string }>(refused).message,
      },
    ]);
  });

  it("rend le refus de la composition au lieu des montants, sans rien écrire", async () => {
    await staff()
      .patch("/admin/order-cutoff-settings")
      .send({ sameDayProAllowed: false })
      .expect(204);
    const body = pickupBody({
      supply: "shelf",
      entryShortcut: "immediate_pickup",
      requestedDeliveryDate: today(),
      requestedWindow: { start: "12:00", end: "13:00" },
    });

    const view = await estimate(body);
    const refused = await staff().post("/admin/orders").send(body).expect(409);

    expect(view.amounts).toBeNull();
    expect(view.refusal).toEqual({
      code: jsonBody<{ code: string }>(refused).code,
      message: jsonBody<{ message: string }>(refused).message,
    });
  });
});
