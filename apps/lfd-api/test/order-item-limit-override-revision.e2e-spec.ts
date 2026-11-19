/**
 * E2E du **dépassement de la limite d'un produit en modification** (plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.6, lot O5).
 *
 * La scène, vraie à toute heure : la règle générale ferme la veille à 00:01
 * pour une journée dans trente jours — encore ouverte ; le levain demande
 * soixante jours de préavis — déjà passé. La commande est passée au compte
 * AVANT que la limite du levain soit posée : elle porte déjà un levain.
 *
 * - L'équipe : la limite d'article oppose les lignes AJOUTÉES ou AUGMENTÉES ;
 *   la case du produit et le droit `lfc_product_limit_override` la font
 *   passer, avec un motif, et une trace `revision`.
 * - Le client : une limite passée outre et consignée ne fige pas la commande ;
 *   l'augmenter se juge comme un ajout.
 */
import type { AdminPlacedOrderResponse, OrderRevisionQuoteView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  E2E_STAFF_SUB,
  bootstrapE2e,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardProvidersOverride } from "./card-payments.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const MEMBER = "auth0|membre-levain-revision";
/** Un administrateur à qui l'on a retiré le droit d'écrire. */
const WITHOUT_RIGHT = "staff-sans-depassement-revision";
/** Le levain, que la limite de soixante jours vise. */
const LEVAIN = "VIE-001-1";
/** Un article sans limite propre. */
const OTHER = "VIE-002-1";
const DAY = serviceDay(30);
/** Une semaine plus tôt, même jour de semaine : la date où l'équipe avance la commande. */
const EARLIER = serviceDay(23);

/** Le jeton porteur EST le `sub` : chaque membre de l'équipe se nomme par le sien. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let pickupId = "";
let orderId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      cardProvidersOverride("pi_ovr_revision"),
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = (
    await ctx.prisma.site.create({
      data: {
        label: "Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
    })
  ).id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const member = await createUser(ctx.prisma, {
    auth0Sub: MEMBER,
    email: "levain-revision@test.fr",
  });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  // La règle générale : la veille à 00:01 — ouverte pour une journée dans 30 jours.
  await ctx.prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "00:01", graceMinutes: 0 },
  });
  await staffDeniedWrite(WITHOUT_RIGHT);
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: company.id,
        buyerUserId: member.id,
        settlement: "account",
        ...content([
          { sku: LEVAIN, quantity: 2 },
          { sku: OTHER, quantity: 3 },
        ]),
      })
      .expect(201),
  );
  orderId = placed.id;
});

/** La limite du levain, 60 jours avant, telle que le fil la dépose, case comprise. */
async function seedLimit(staffMayExceed: boolean): Promise<void> {
  await ctx.prisma.catalogItem.update({
    where: { sku: LEVAIN },
    data: {
      orderLimitDaysBefore: 60,
      orderLimitTime: "23:59",
      orderLimitGraceMinutes: 0,
      orderLimitStaffMayExceed: staffMayExceed,
    },
  });
}

async function staffDeniedWrite(sub: string): Promise<void> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "admin",
      status: "active",
      auth0Id: sub,
    },
  });
  await ctx.prisma.staffPermissionOverride.create({
    data: {
      staffUserId: row.id,
      resource: "lfc_product_limit_override",
      action: "write",
      effect: "deny",
    },
  });
}

function content(
  lines: readonly { readonly sku: string; readonly quantity: number }[],
  day: string = DAY,
): Record<string, unknown> {
  return {
    requestedDeliveryDate: day,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines,
  };
}

/** Le levain monté à 3 : une ligne augmentée. */
const MORE_LEVAIN = [
  { sku: LEVAIN, quantity: 3 },
  { sku: OTHER, quantity: 3 },
];

/** Les lignes de la passation, inchangées. */
const SAME_LINES = [
  { sku: LEVAIN, quantity: 2 },
  { sku: OTHER, quantity: 3 },
];

function staffRevise(sub: string, lines: typeof MORE_LEVAIN, reason?: string, day: string = DAY) {
  return ctx
    .asSub(sub)
    .post(`/admin/orders/${orderId}/revisions`)
    .send({
      expectedRevision: 0,
      ...content(lines, day),
      ...(reason === undefined ? {} : { itemLimitOverrideReason: reason }),
    });
}

async function state(): Promise<readonly number[]> {
  const [order, traces] = await Promise.all([
    ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { revision: true } }),
    ctx.prisma.orderItemLimitOverride.count({ where: { orderId } }),
  ]);
  return [order.revision, traces];
}

describe("l'équipe modifie une commande et la limite d'un produit", () => {
  /**
   * Régression : déplacer la date ne rejugeait que les lignes ajoutées ou
   * augmentées ; un produit à limite passée déjà au panier passait à la
   * nouvelle date sans droit, sans motif, sans trace (fermé le 2026-11-19).
   */
  it("sans le droit, avancer la date d'une commande qui porte le levain est refusé", async () => {
    await seedLimit(true);

    const response = await staffRevise(WITHOUT_RIGHT, SAME_LINES, "Salon", EARLIER).expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.item_limit_past" });
    expect(await state()).toEqual([0, 0]);
  });

  it("avec le droit, la case et un motif, la date change et le dépassement est consigné", async () => {
    await seedLimit(true);

    await staffRevise(E2E_STAFF_SUB, SAME_LINES, "Le client part plus tôt", EARLIER).expect(
      (response) => expect([200, 201]).toContain(response.status),
    );

    expect(await state()).toEqual([1, 1]);
  });

  it("sans le droit, augmenter le levain est refusé en le nommant", async () => {
    await seedLimit(true);

    const response = await staffRevise(WITHOUT_RIGHT, MORE_LEVAIN, "Salon").expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.item_limit_past" });
    expect(await state()).toEqual([0, 0]);
  });

  it("avec le droit, case cochée, sans motif : refusé, rien d'écrit", async () => {
    await seedLimit(true);

    const response = await staffRevise(E2E_STAFF_SUB, MORE_LEVAIN).expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.item_limit_reason_required" });
    expect(await state()).toEqual([0, 0]);
  });

  it("avec le droit et un motif : la révision, et une trace `revision`", async () => {
    await seedLimit(true);

    await staffRevise(E2E_STAFF_SUB, MORE_LEVAIN, "Le client l'a demandé au salon").expect(200);

    const staff = await ctx.prisma.staffUser.findFirstOrThrow({
      where: { auth0Id: E2E_STAFF_SUB },
      select: { id: true },
    });
    expect(await state()).toEqual([1, 1]);
    const traces = await ctx.prisma.orderItemLimitOverride.findMany({ where: { orderId } });
    expect(traces).toEqual([
      expect.objectContaining({
        sku: LEVAIN,
        staffUserId: staff.id,
        reason: "Le client l'a demandé au salon",
        daysBefore: 60,
        time: "23:59",
        origin: "revision",
        serviceDay: new Date(`${DAY}T00:00:00.000Z`),
      }),
    ]);
  });

  it("avec le droit, case décochée : refusé, même avec un motif", async () => {
    await seedLimit(false);

    const response = await staffRevise(E2E_STAFF_SUB, MORE_LEVAIN, "Salon").expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.item_limit_past" });
    expect(await state()).toEqual([0, 0]);
  });

  it("sans le droit, une ligne gardée ou réduite passe comme aujourd'hui", async () => {
    await seedLimit(false);

    await staffRevise(WITHOUT_RIGHT, [
      { sku: LEVAIN, quantity: 1 },
      { sku: OTHER, quantity: 5 },
    ]).expect(200);

    expect(await state()).toEqual([1, 0]);
  });

  it("le devis de l'équipe annonce le dépassement sans exiger de motif", async () => {
    await seedLimit(true);

    const view = jsonBody<OrderRevisionQuoteView>(
      await ctx
        .asSub(E2E_STAFF_SUB)
        .post(`/admin/orders/${orderId}/revisions/quote`)
        .send(content(MORE_LEVAIN))
        .expect(200),
    );

    expect(view.itemLimitOverrides).toEqual([
      expect.objectContaining({ sku: LEVAIN, daysBefore: 60, time: "23:59" }),
    ]);
  });
});

describe("le client modifie une commande dont le levain a été passé outre", () => {
  beforeEach(async () => {
    await seedLimit(true);
    await staffRevise(E2E_STAFF_SUB, MORE_LEVAIN, "Salon").expect(200);
  });

  function customerRevise(lines: typeof MORE_LEVAIN) {
    return ctx
      .asSub(MEMBER)
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 1, ...content(lines) });
  }

  it("modifie une autre ligne : la commande n'est pas figée", async () => {
    await customerRevise([
      { sku: LEVAIN, quantity: 3 },
      { sku: OTHER, quantity: 6 },
    ]).expect(200);

    expect(await state()).toEqual([2, 1]);
  });

  it("augmente le levain : refusé comme un ajout", async () => {
    const response = await customerRevise([
      { sku: LEVAIN, quantity: 4 },
      { sku: OTHER, quantity: 3 },
    ]).expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await state()).toEqual([1, 1]);
  });
});
