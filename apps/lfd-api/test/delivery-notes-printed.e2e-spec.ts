/**
 * E2E du **bon de livraison imprimé** (plan
 * plan E5a (`documentation/commandes/bon-de-livraison.md`), § 4) :
 * la liste et les deux PDF côté équipe, le BL chiffré côté client, et le mur
 * de la société — un client d'une autre société lit un 404.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import { Buffer } from "node:buffer";

import type { AdminPlacedOrderResponse, StaffNote } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import type request from "supertest";

import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-bl-imprime";
const OUTSIDER = "auth0|curieux-bl-imprime";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_bli_${String(intentCounter)}`;
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
  const user = await createUser(ctx.prisma, {
    auth0Sub: BUYER,
    email: "acheteur-bl-imprime@test.fr",
  });
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

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

async function numberOf(orderId: string): Promise<string> {
  const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  return orderNumber;
}

async function markFulfilled(orderId: string, at = new Date()): Promise<Date> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderFulfilledCommand(await numberOf(orderId), E2E_STAFF_ID, at, "manual"));
  return at;
}

/** Le corps brut : supertest ne parse pas un PDF tout seul. */
function getPdf(agent: ReturnType<E2eContext["asSub"]>, path: string): request.Test {
  return agent
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    });
}

function bytesOf(response: request.Response): Buffer {
  const body: unknown = response.body;
  return Buffer.isBuffer(body) ? body : Buffer.alloc(0);
}

/** Une commande remise : arrêt du plan, puis remise. */
async function handedOver(where: Scene): Promise<string> {
  const orderId = await placeOnAccount(where);
  await closePlan();
  await markFulfilled(orderId);
  return orderId;
}

describe("le BL vu de l'équipe (plan E5a, § 3)", () => {
  it("liste les BL de la commande, puis sert le transport en ligne et le chiffré en pièce jointe", async () => {
    const orderId = await handedOver(await scene());

    const list = jsonBody<readonly StaffNote[]>(
      await staff().get(`/admin/orders/${orderId}/delivery-notes`).expect(200),
    );
    expect(list).toHaveLength(1);
    const [note] = list;
    expect(note).toMatchObject({ audience: "staff", status: "handed_over" });
    const number = note?.number ?? "";

    const carrier = await getPdf(
      staff(),
      `/admin/orders/${orderId}/delivery-notes/${number}/carrier.pdf`,
    ).expect(200);
    expect(carrier.headers["content-disposition"]).toContain("inline");
    expect(bytesOf(carrier).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const priced = await getPdf(
      staff(),
      `/admin/orders/${orderId}/delivery-notes/${number}/client.pdf`,
    ).expect(200);
    expect(priced.headers["content-disposition"]).toContain("attachment");
    expect(bytesOf(priced).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("404 sur un numéro que la commande ne porte pas", async () => {
    const orderId = await handedOver(await scene());

    await staff().get(`/admin/orders/${orderId}/delivery-notes/BL-0-1/carrier.pdf`).expect(404);
  });
});

describe("le BL dans l'espace client (plan E5a, § 3)", () => {
  it("le client télécharge le BL chiffré de sa commande remise", async () => {
    const orderId = await handedOver(await scene());

    const response = await getPdf(ctx.asSub(BUYER), `/orders/${orderId}/delivery-note.pdf`).expect(
      200,
    );

    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(bytesOf(response).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("un client d'une autre société lit un 404 — le mur", async () => {
    const orderId = await handedOver(await scene());
    const other = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const outsider = await createUser(ctx.prisma, {
      auth0Sub: OUTSIDER,
      email: "curieux-bl-imprime@test.fr",
    });
    await attachTo(ctx.prisma, outsider.id, other.id, CustomerRole.owner);

    await ctx.asSub(OUTSIDER).get(`/orders/${orderId}/delivery-note.pdf`).expect(404);
  });

  it("404 tant que la commande n'est pas remise", async () => {
    const orderId = await placeOnAccount(await scene());
    await closePlan();

    await ctx.asSub(BUYER).get(`/orders/${orderId}/delivery-note.pdf`).expect(404);
  });
});
