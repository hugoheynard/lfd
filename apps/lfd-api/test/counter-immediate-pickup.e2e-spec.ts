/**
 * E2E du **« Retrait immédiat » au comptoir** (lot L6 —
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`,
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

import { MonthlyInvoicingReader } from "../src/lafoliecoffee/accounting/domain/ports/monthly-invoicing.reader.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";

const fakeGateway = cardGatewayDouble("pi_counter");

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
      { token: CardProviders, value: fakeGateway },
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
  // Sans le raccourci : une prise sur la vitrine qui n'est pas le « Retrait
  // immédiat » — le seul chemin qui règle encore par lien depuis E4.
  shortcut: "immediate_pickup" | null = "immediate_pickup",
): Promise<Placed> {
  const response = await staff()
    .post("/admin/orders")
    .send({
      companyId: pro.companyId,
      buyerUserId: pro.userId,
      settlement,
      supply: "shelf",
      ...(shortcut === null ? {} : { entryShortcut: shortcut }),
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
  /**
   * Option A (Hugo, 2026-11-03) : le comptoir ouvre le bon de commande chiffré
   * — le même que celui du client — sous son seul droit, AVANT la remise.
   */
  it("le vendeur du comptoir ouvre le bon de commande avant la remise, sans le droit des Commandes", async () => {
    const pro = await seedCreditedPro("pro-bon");
    const placed = await placeImmediate(pro, "account");
    const seller = await counterSeller();

    const pdf = await seller
      .get(`/admin/counter/orders/${placed.id}/bon.pdf`)
      .buffer(true)
      .expect(200);

    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toMatch(/^inline/u);
    // La route de l'équipe Commandes lui reste fermée.
    await seller.get(`/admin/orders/${placed.id}/bon.pdf`).expect(403);
  });

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
    // Le refus « pas encore écrit » (`delivery_notes.counter.not_yet`) se
    // prouve en unitaire (delivery-note-pdf.handlers.spec.ts) : ici, le relais
    // peut livrer le fait de remise avant la lecture. Régression (CI du
    // 2026-11-03) : l'attendre ici rendait la suite rouge selon la vitesse.
    const seller = await counterSeller();
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { status: true, paymentStatus: true },
    });
    expect(order).toEqual({ status: "fulfilled", paymentStatus: "not_required" });

    // Le BL est né à la remise ; le vendeur du comptoir imprime celui de
    // TRANSPORT, sans son numéro (Hugo, 2026-11-03 : non chiffré, comme en livraison).
    const pdf = await seller
      .get(`/admin/counter/orders/${placed.id}/delivery-note/carrier.pdf`)
      .buffer(true)
      .expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain("-transport.pdf");
    // L'ancienne route du BL chiffré au comptoir est partie dans le même déploiement.
    await seller.get(`/admin/counter/orders/${placed.id}/delivery-note/client.pdf`).expect(404);

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
   *
   * Depuis le 2026-11-03 (E4, `plan-prix-de-la-saisie.md` §5), le « Retrait
   * immédiat » ne se règle plus par lien : la commande au lien est prise ici
   * sur la vitrine SANS le raccourci, le seul chemin du serveur qui la permet.
   */
  it("une remise refusée laisse la commande passée, sans BL ni facture", async () => {
    const pro = await seedCreditedPro("pro-lien");
    // Envoyée au lien de paiement : son règlement n'est pas clos, la remise refuse.
    const placed = await placeImmediate(pro, "link", null);

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

  /** Régression : le « Retrait immédiat » acceptait un lien de règlement (E4, 2026-11-03). */
  it("refuse le lien de règlement au « Retrait immédiat », sans rien écrire", async () => {
    const pro = await seedCreditedPro("pro-comptoir-lien");
    const before = await ctx.prisma.order.count();
    const response = await staff()
      .post("/admin/orders")
      .send({
        companyId: pro.companyId,
        buyerUserId: pro.userId,
        settlement: "link",
        supply: "shelf",
        entryShortcut: "immediate_pickup",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "12:00", end: "13:00" },
        lines: [{ sku: CROISSANT, quantity: 1 }],
      })
      .expect(400);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "orders.counter.link_settlement_refused",
    );
    expect(await ctx.prisma.order.count()).toBe(before);
  });

  /**
   * Régression : une commande PROGRAMMÉE saisie au comptoir acceptait un lien
   * de règlement — seul le raccourci signalait le comptoir (E4 étendu, 2026-11-03).
   */
  it("refuse le lien de règlement à une commande programmée saisie au comptoir", async () => {
    const pro = await seedCreditedPro("pro-comptoir-programme-lien");
    const before = await ctx.prisma.order.count();
    const response = await staff()
      .post("/admin/orders")
      .send({
        companyId: pro.companyId,
        buyerUserId: pro.userId,
        settlement: "link",
        entryOrigin: "counter",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "12:00", end: "13:00" },
        lines: [{ sku: CROISSANT, quantity: 1 }],
      })
      .expect(400);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "orders.counter.link_settlement_refused",
    );
    expect(await ctx.prisma.order.count()).toBe(before);
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
      .get(`/admin/counter/orders/${planned.id}/delivery-note/carrier.pdf`)
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

describe("la tolérance de retard au comptoir (Hugo, 2026-11-03)", () => {
  it("rend au vendeur la tolérance du réglage — 15 par défaut, puis celle posée", async () => {
    const seller = await counterSeller();

    const initial = await seller.get("/admin/counter/late-tolerance").expect(200);
    expect(initial.body).toEqual({ lateToleranceMinutes: 15 });

    await staff()
      .patch("/admin/order-cutoff-settings")
      .send({ lateToleranceMinutes: 25 })
      .expect(204);
    const posed = await seller.get("/admin/counter/late-tolerance").expect(200);
    expect(posed.body).toEqual({ lateToleranceMinutes: 25 });
    // Le réglage entier, lui, reste à l'équipe Commandes.
    await seller.get("/admin/order-cutoff-settings").expect(403);
  });
});
