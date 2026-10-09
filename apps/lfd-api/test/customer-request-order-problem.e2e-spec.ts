/**
 * E2E de **« Signaler un problème »** — `POST /me/orders/:id/problems`
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §3.2, §6, §7) —
 * vrai Postgres, vrai MinIO, mailer doublé.
 *
 * Ce que seul le vrai chemin prouve : le multipart et ses photos rangées sous
 * `requests/<id>/…`, la règle d'accès d'une commande (404 hors périmètre), le
 * 409 d'une commande pas encore retirée ni livrée, le débit PAR COMPTE, la
 * photo servie par la route admin et refusée sans droit, et l'anonymisation
 * qui vide `order_id` et SUPPRIME l'objet du stockage.
 */
import { Buffer } from "node:buffer";

import type { CreatedIdResponse, CustomerRequestView, RequestReasonPayload } from "@lfd/contracts";
import type { Test } from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import { storageKeys } from "./storage.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: Record<string, unknown>;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un PNG minimal : signature puis IHDR, 40 × 30. */
function png(): Buffer {
  const header = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(40, 16);
  header.writeUInt32BE(30, 20);
  return header;
}

const DAMAGED: RequestReasonPayload = {
  kind: "order_problem",
  label: { fr: "Produit abîmé", en: "Damaged product", it: "" },
  recipientEmail: "sav@lfc.test",
  position: 0,
  active: true,
  audience: "both",
  priority: "urgent",
};

async function createReason(overrides: Partial<RequestReasonPayload> = {}): Promise<string> {
  const response = await staff()
    .post("/admin/request-reasons")
    .send({ ...DAMAGED, ...overrides })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

let sequence = 0;

/**
 * Une commande personnelle semée à l'état voulu. Écrite par Prisma faute de
 * chemin court vers `fulfilled` (dette des factories, `test/factories.ts`).
 */
async function seedOrder(
  userId: string,
  status: OrderStatus,
): Promise<{ id: string; number: string }> {
  sequence += 1;
  const number = `CMD-PB-${String(sequence)}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: number,
      placedByUserId: userId,
      clientele: OrderClientele.public,
      status,
      subtotalCents: 2_000,
      discountCents: 0,
      totalCents: 2_000,
      paymentStatus: PaymentStatus.paid,
      requestedDeliveryDate: new Date(daysAgo(2)),
    },
    select: { id: true },
  });
  return { id: order.id, number };
}

function report(sub: string, orderId: string, reasonId: string, photos = 0): Test {
  let call = ctx
    .asSub(sub)
    .post(`/me/orders/${orderId}/problems`)
    .field("reasonId", reasonId)
    .field("message", "Le pain était écrasé.");
  for (let index = 0; index < photos; index += 1) {
    call = call.attach("photos", png(), {
      filename: `p${String(index)}.png`,
      contentType: "image/png",
    });
  }
  return call;
}

async function pending(): Promise<CustomerRequestView[]> {
  return jsonBody<CustomerRequestView[]>(
    await staff().get("/admin/customer-requests?status=pending&kind=order_problem").expect(200),
  );
}

describe("un client signale un problème sur sa commande retirée", () => {
  it("la demande porte la commande et ses photos ; le courriel cite la référence", async () => {
    const user = await createUser(ctx.prisma, {
      auth0Sub: "auth0|pb-client",
      firstName: "Jean",
      lastName: "Martin",
    });
    const order = await seedOrder(user.id, OrderStatus.fulfilled);
    const reasonId = await createReason();

    const id = jsonBody<CreatedIdResponse>(
      await report("auth0|pb-client", order.id, reasonId, 2).expect(201),
    ).id;
    await ctx.drain();

    const [request] = await pending();
    expect(request).toMatchObject({
      id,
      kind: "order_problem",
      reasonLabel: "Produit abîmé",
      authorName: "Jean Martin",
      userId: user.id,
      details: { kind: "order_problem", orderId: order.id, orderNumber: order.number },
    });
    const photos = request?.details.kind === "order_problem" ? request.details.photos : [];
    expect(photos).toHaveLength(2);
    expect(await storageKeys()).toEqual(photos.map((p) => `requests/${id}/${p.id}`).sort());

    const served = await staff()
      .get(`/admin/customer-requests/${id}/photos/${photos[0]?.id ?? ""}`)
      .expect(200);
    expect(served.headers["content-type"]).toBe("image/png");

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]).toMatchObject({
      to: "sav@lfc.test",
      template: "staff.customer-request",
      data: { orderNumber: order.number, photoCount: 2 },
    });
  });

  it("une commande pas encore retirée ni livrée → 409 nommé", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|pb-early" });
    const order = await seedOrder(user.id, OrderStatus.placed);
    const reasonId = await createReason();
    const refused = await report("auth0|pb-early", order.id, reasonId).expect(409);
    expect(JSON.stringify(refused.body)).toContain("contact.order_problem.not_fulfilled");
    expect(await pending()).toEqual([]);
  });

  it("la commande d'un autre → 404, sans rien ranger", async () => {
    const owner = await createUser(ctx.prisma, { auth0Sub: "auth0|pb-owner" });
    await createUser(ctx.prisma, { auth0Sub: "auth0|pb-curious" });
    const order = await seedOrder(owner.id, OrderStatus.fulfilled);
    const reasonId = await createReason();
    await report("auth0|pb-curious", order.id, reasonId).expect(404);
    expect(await pending()).toEqual([]);
    expect(await storageKeys()).toEqual([]);
  });

  it("une quatrième photo est refusée, et rien n'est rangé", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|pb-four" });
    const order = await seedOrder(user.id, OrderStatus.fulfilled);
    const reasonId = await createReason();
    await report("auth0|pb-four", order.id, reasonId, 4).expect(400);
    expect(await pending()).toEqual([]);
    expect(await storageKeys()).toEqual([]);
  });

  it("un motif « Nous écrire » est refusé par le signalement (§6.5)", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|pb-kind" });
    const order = await seedOrder(user.id, OrderStatus.fulfilled);
    const contact = await createReason({ kind: "contact" });
    await report("auth0|pb-kind", order.id, contact).expect(409);
  });

  it("le débit par compte : le quatrième signalement en dix minutes est refusé", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|pb-rate" });
    const order = await seedOrder(user.id, OrderStatus.fulfilled);
    const reasonId = await createReason();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await report("auth0|pb-rate", order.id, reasonId).expect(201);
    }
    await report("auth0|pb-rate", order.id, reasonId).expect(429);
  });
});

describe("l'anonymisation d'un signalement", () => {
  it("vide `order_id` et SUPPRIME les photos du stockage ; la ligne reste", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|pb-old" });
    const order = await seedOrder(user.id, OrderStatus.fulfilled);
    const reasonId = await createReason();
    const id = jsonBody<CreatedIdResponse>(
      await report("auth0|pb-old", order.id, reasonId, 1).expect(201),
    ).id;
    await ctx.drain();
    // Les dates sont posées en base : l'API n'écrit qu'à l'instant présent.
    await ctx.prisma.customerRequest.update({
      where: { id },
      data: { receivedAt: new Date(daysAgo(400)) },
    });

    await ctx
      .http()
      .post("/admin/contact/messages/anonymization/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    const row = await ctx.prisma.customerRequest.findUniqueOrThrow({
      where: { id },
      include: { photos: true },
    });
    expect(row).toMatchObject({ orderId: null, orderNumber: null, authorEmail: "", body: "" });
    expect(row.anonymizedAt).not.toBeNull();
    expect(row.photos).toEqual([
      expect.objectContaining({ storageKey: "", contentType: "", sizeBytes: 0 }),
    ]);
    expect(await storageKeys()).toEqual([]);
  });
});
