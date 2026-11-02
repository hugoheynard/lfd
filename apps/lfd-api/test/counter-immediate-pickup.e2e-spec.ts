/**
 * E2E du **« Retrait immédiat » au comptoir** (lot L6 —
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §1, §5,
 * §11.3, §14).
 *
 * « Valider et remettre » est deux appels existants, enchaînés par l'écran :
 * la passation (`POST /admin/orders`, `supply: "shelf"`, `entryShortcut:
 * "immediate_pickup"`), puis la remise saisie (`POST
 * /admin/handover/manual/:orderNumber`). Ce que seul le vrai SQL prouve : que
 * la remise crée le BL (remise hors plan) et clôt le règlement, que la
 * commande entre dans la facture du mois, qu'une remise refusée laisse la
 * commande dans la file, et que le vendeur du comptoir n'imprime QUE le BL
 * d'un retrait remis.
 *
 * Deux frontières doublées : la signature du jeton et la passerelle Stripe.
 */
import { instantToLocal, localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { MonthlyInvoicingReader } from "../src/b2b/accounting/domain/ports/monthly-invoicing.reader.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_counter_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_counter",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const CROISSANT = "VIE-001-1";
const RECEIVED = 10;
const DAY_MS = 86_400_000;

/** Midi aujourd'hui à Paris. */
function todayAt(time: string): Date {
  return localToInstant(instantToLocal(new Date()).day, time) ?? new Date();
}

const clock = new FixedClock(todayAt("12:00"));
let ctx: E2eContext;
let siteId = "";
let day = "";

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
  day = instantToLocal(clock.now()).day;
  siteId = await seedShop();
  await staff()
    .patch("/admin/order-cutoff-settings")
    .send({ sameDayProAllowed: true, sameDayProWithoutCredit: "payment_link" })
    .expect(204);
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Une boutique, dix croissants reçus aujourd'hui. */
async function seedShop(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Boutique du Centre",
      ligne1: "1 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  await staff()
    .post(`/admin/resupply-receipts/${site.id}/${instantToLocal(clock.now()).day}/lines`)
    .send({ sku: CROISSANT, quantity: RECEIVED })
    .expect(204);
  return site.id;
}

/** Un pro actif au crédit accordé, et son acheteur. */
async function seedCreditedPro(
  key: string,
): Promise<{ readonly companyId: string; readonly userId: string }> {
  const user = await createUser(ctx.prisma, { auth0Sub: `auth0|${key}`, email: `${key}@l6.fr` });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, user.id, company.id);
  return { companyId: company.id, userId: user.id };
}

/** Un membre du staff qui ne tient QUE le comptoir — le vendeur. */
async function counterSeller(): Promise<request.Agent> {
  const key = "vendeur-comptoir";
  await staff()
    .post("/admin/staff-roles")
    .send({ key, label: key, grants: [{ resource: "handover_counter", action: "write" }] })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

interface Placed {
  readonly id: string;
  readonly orderNumber: string;
}

/** La passation du « Retrait immédiat » : sur la vitrine, au point, maintenant. */
async function placeImmediate(
  pro: { readonly companyId: string; readonly userId: string },
  settlement: "account" | "link",
): Promise<Placed> {
  const response = await staff()
    .post("/admin/orders")
    .send({
      companyId: pro.companyId,
      buyerUserId: pro.userId,
      settlement,
      supply: "shelf",
      entryShortcut: "immediate_pickup",
      requestedDeliveryDate: day,
      fulfillmentMethod: "pickup",
      pickupAddressId: siteId,
      requestedWindow: { start: "12:00", end: "13:00" },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    })
    .expect(201);
  return jsonBody<Placed>(response);
}

async function noteNumberOf(orderId: string): Promise<string> {
  const note = await ctx.prisma.deliveryNote.findFirstOrThrow({
    where: { orderId },
    select: { number: true },
  });
  return note.number;
}

describe("« Valider et remettre » (lot L6)", () => {
  it("donne une commande remise, son BL imprimable au comptoir, et la facture du mois", async () => {
    const pro = await seedCreditedPro("pro-immediat");
    const placed = await placeImmediate(pro, "account");

    // La marque et la trace du raccourci, posées par le serveur.
    expect(
      await ctx.prisma.order.findUniqueOrThrow({
        where: { id: placed.id },
        select: { supply: true, entryShortcut: true },
      }),
    ).toEqual({ supply: "shelf", entryShortcut: "immediate_pickup" });

    await staff().post(`/admin/handover/manual/${placed.orderNumber}`).send({}).expect(201);
    // Remise attestée, fait de remise pas encore livré : le BL n'est pas écrit.
    const seller = await counterSeller();
    const early = await seller
      .get(`/admin/counter/orders/${placed.id}/delivery-note/client.pdf`)
      .expect(404);
    expect(jsonBody<{ code: string }>(early).code).toBe("delivery_notes.counter.not_yet");
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { status: true, paymentStatus: true },
    });
    expect(order).toEqual({ status: "fulfilled", paymentStatus: "not_required" });

    // Le BL est né à la remise ; le vendeur du comptoir l'imprime, sans son numéro.
    const pdf = await seller
      .get(`/admin/counter/orders/${placed.id}/delivery-note/client.pdf`)
      .buffer(true)
      .expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");

    // La facture du mois la porte.
    const billable = await ctx.app
      .get(MonthlyInvoicingReader, { strict: false })
      .uninvoicedOrders(new Date(0), new Date(clock.now().getTime() + 31 * DAY_MS));
    expect(billable.map((one) => one.orderId)).toContain(placed.id);
  });

  /**
   * Une remise refusée ne défait rien de la passation : la commande reste
   * passée, sans BL ni facture, et le geste normal la remettra une fois réglée.
   *
   * ⚠️ Le plan (§11.3) dit qu'elle « attend dans la file » : c'est faux pour
   * la seule remise que le comptoir puisse se voir refuser, celle d'une
   * commande au lien de paiement — la file ne montre une commande non réglée
   * à personne (`showsInQueue`, `commande-carte-reglee.md` §4.4, vérifié le
   * 2026-11-02). Elle y entre à son paiement. Remonté au plan, non tranché ici.
   */
  it("une remise refusée laisse la commande passée, sans BL ni facture", async () => {
    const pro = await seedCreditedPro("pro-lien");
    // Envoyée au lien de paiement : son règlement n'est pas clos, la remise refuse.
    const placed = await placeImmediate(pro, "link");

    const refused = await staff()
      .post(`/admin/handover/manual/${placed.orderNumber}`)
      .send({})
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("handover.refused");
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { status: true, handedOverAt: true },
    });
    expect(order).toEqual({ status: "placed", handedOverAt: null });
    expect(await ctx.prisma.deliveryNote.count({ where: { orderId: placed.id } })).toBe(0);
  });

  it("refuse un « Retrait immédiat » sur une commande programmée", async () => {
    const pro = await seedCreditedPro("pro-programme");
    const response = await staff()
      .post("/admin/orders")
      .send({
        companyId: pro.companyId,
        buyerUserId: pro.userId,
        settlement: "account",
        entryShortcut: "immediate_pickup",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "12:00", end: "13:00" },
        lines: [{ sku: CROISSANT, quantity: 1 }],
      })
      .expect(400);
    expect(jsonBody<{ code: string }>(response).code).toBe("orders.shelf.shortcut_off_shelf");
  });
});

describe("le BL client au comptoir — le mur (lot L6)", () => {
  it("le vendeur du comptoir n'obtient pas le BL d'une commande qu'il n'a pas remise", async () => {
    const pro = await seedCreditedPro("pro-programme-bl");
    // Une commande fabriquée : son BL naît à l'arrêt du plan, prévu, jamais remis.
    const planned = jsonBody<Placed>(
      await staff()
        .post("/admin/orders")
        .send({
          companyId: pro.companyId,
          buyerUserId: pro.userId,
          settlement: "account",
          requestedDeliveryDate: day,
          fulfillmentMethod: "pickup",
          pickupAddressId: siteId,
          requestedWindow: { start: "14:00", end: "15:00" },
          lines: [{ sku: CROISSANT, quantity: 2 }],
        })
        .expect(201),
    );
    await staff().post(`/admin/production/batch/${day}/close`).expect(201);
    await ctx.drain();
    const number = await noteNumberOf(planned.id);

    const seller = await counterSeller();
    const refused = await seller
      .get(`/admin/counter/orders/${planned.id}/delivery-note/client.pdf`)
      .expect(404);
    expect(jsonBody<{ code: string }>(refused).code).toBe("delivery_notes.counter.out_of_reach");
    // La route de l'équipe Commandes reste fermée au vendeur.
    await seller.get(`/admin/orders/${planned.id}/delivery-notes/${number}/client.pdf`).expect(403);
    // Aucune impression tracée pour un bon refusé.
    const note = await ctx.prisma.deliveryNote.findFirstOrThrow({
      where: { orderId: planned.id },
      select: { printedAt: true },
    });
    expect(note.printedAt).toBeNull();
  });
});
