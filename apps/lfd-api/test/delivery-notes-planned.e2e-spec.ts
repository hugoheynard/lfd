/**
 * E2E du **bon de livraison prévu** (plan
 * plan E1 (`documentation/commandes/bon-de-livraison.md`), lot E1).
 *
 * Ce que seul le vrai Postgres prouve : que le BL-1 naît dans la transaction
 * de l'abonné de l'arrêt, sur les seules commandes que cet arrêt a confirmées ;
 * que l'unicité `(order_id, rank)` et la réécriture tiennent sur une seconde
 * livraison et une re-clôture ; que l'annulation d'une commande rendue au
 * client par une réouverture annule son BL dans sa propre transaction.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  type AdminPlacedOrderResponse,
} from "@lfd/contracts";
import { randomUUID } from "node:crypto";

import {
  ON_PRODUCTION_DAY_CLOSED,
  OnProductionDayClosed,
} from "../src/b2b/orders/application/handlers/on-production-day-closed.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { ProductionDayClosedEvent } from "../src/production/channels/commerce/index.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-bon-de-livraison";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_bl_${String(intentCounter)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment",
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un point de retrait et une société au compte. */
interface Scene {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly pickupId: string;
}

async function scene(): Promise<Scene> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur-bl@test.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: user.id, pickupId: point.id };
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity }],
  };
}

/** Une commande au compte, saisie par l'équipe. */
async function placeOnAccount(where: Scene, quantity = 10): Promise<string> {
  const response = await staff()
    .post("/admin/orders")
    .send({
      companyId: where.companyId,
      buyerUserId: where.buyerUserId,
      settlement: "account",
      ...content(where.pickupId, quantity),
    })
    .expect(201);
  return jsonBody<AdminPlacedOrderResponse>(response).id;
}

/** Une commande personnelle par carte, jamais réglée : `planWhere` l'écarte. */
async function placeUnpaidCard(where: Scene): Promise<string> {
  const response = await ctx
    .asSub(BUYER)
    .post("/orders")
    .set(WORKSPACE_HEADER, PERSONAL_WORKSPACE)
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      settlement: "card",
      ...content(where.pickupId, 3),
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

async function reopen(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/reopen`).expect(201);
  await ctx.drain();
}

function notesOf(orderId: string) {
  return ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: {
      id: true,
      rank: true,
      number: true,
      status: true,
      voidedAt: true,
      lines: {
        orderBy: { id: "asc" },
        select: {
          sku: true,
          productName: true,
          unitPriceMillicents: true,
          vatRate: true,
          quantity: true,
          lineTotalCents: true,
          unitPriceTtcCents: true,
          lineTotalTtcCents: true,
        },
      },
    },
  });
}

async function orderOf(orderId: string) {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      confirmedAt: true,
      lines: {
        orderBy: { id: "asc" },
        select: {
          sku: true,
          productNameSnapshot: true,
          unitPriceMillicents: true,
          vatRate: true,
          quantity: true,
          lineTotalCents: true,
          unitPriceTtcCents: true,
          lineTotalTtcCents: true,
        },
      },
    },
  });
  const lines = order.lines.map(({ productNameSnapshot, ...line }) => ({
    ...line,
    productName: productNameSnapshot,
  }));
  return { ...order, lines };
}

/** Le BL-1 attendu d'une commande : son numéro sans `ORD-`, ses lignes recopiées. */
function expectedNumber(orderNumber: string): string {
  return `BL-${orderNumber.replace(/^ORD-/, "")}-1`;
}

describe("le BL prévu naît à l'arrêt du plan", () => {
  it("arrêt → BL-1 prévu, lignes égales ; la commande carte non réglée (planWhere) n'en a pas", async () => {
    const where = await scene();
    const account = await placeOnAccount(where);
    const unpaid = await placeUnpaidCard(where);

    await closePlan();

    const order = await orderOf(account);
    expect(order.status).toBe("confirmed");
    const notes = await notesOf(account);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      rank: 1,
      number: expectedNumber(order.orderNumber),
      status: "planned",
      voidedAt: null,
    });
    expect(notes[0]?.lines).toEqual(order.lines);
    // Écartée par `planWhere`, puis échouée à la clôture (`failAtClosing`) : jamais confirmée.
    expect((await orderOf(unpaid)).status).not.toBe("confirmed");
    expect(await notesOf(unpaid)).toEqual([]);
  });

  it("une seconde livraison du même fait ne crée rien de plus", async () => {
    const where = await scene();
    const account = await placeOnAccount(where);
    await closePlan();
    const [first] = await notesOf(account);
    const { confirmedAt } = await orderOf(account);
    if (confirmedAt === null) {
      throw new Error("la commande devait être confirmée par l'arrêt");
    }
    const fact = new ProductionDayClosedEvent(DAY, confirmedAt, [account]);

    // La livraison rejouée, telle que le relais la ferait : même charge.
    await ctx.app.get(OnProductionDayClosed).handle({
      eventId: `replay-${ON_PRODUCTION_DAY_CLOSED}`,
      type: "production.day_closed",
      payload: fact.durableFact().payload,
    });

    expect(await notesOf(account)).toEqual([first]);
  });

  it("arrêt → réouverture → révision → re-clôture : le BL-1 est RÉÉCRIT, même numéro", async () => {
    const where = await scene();
    const account = await placeOnAccount(where);
    await closePlan();
    const [first] = await notesOf(account);
    await reopen();
    expect(await notesOf(account)).toEqual([first]);

    await staff()
      .post(`/admin/orders/${account}/revisions`)
      .send({ expectedRevision: 0, ...content(where.pickupId, 4) })
      .expect(200);
    await closePlan();

    const order = await orderOf(account);
    const notes = await notesOf(account);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: first?.id, number: first?.number, status: "planned" });
    expect(notes[0]?.lines).toEqual(order.lines);
    expect(notes[0]?.lines.map((line) => line.quantity)).toEqual([4]);
  });

  it("arrêt → réouverture → annulation : le BL passe annulé, sans disparaître", async () => {
    const where = await scene();
    const account = await placeOnAccount(where);
    await closePlan();
    await reopen();

    await staff()
      .post(`/admin/orders/${account}/cancel`)
      .send({ reason: "Le client a rappelé" })
      .expect(204);

    const notes = await notesOf(account);
    expect((await orderOf(account)).status).toBe("cancelled");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.status).toBe("voided");
    expect(notes[0]?.voidedAt).not.toBeNull();
  });
});
