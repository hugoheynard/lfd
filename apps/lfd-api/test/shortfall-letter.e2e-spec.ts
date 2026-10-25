/**
 * **« Écrire au client » après un départ incomplet** (lot E6d,
 * plan E6d (`documentation/commandes/bon-de-livraison.md`) § 2) — sur le vrai
 * Postgres, mailer doublé.
 *
 * Ce que seul le vrai chemin prouve : la proposition lit la décision et les
 * noms de la commande, le texte RELU part (pas le gabarit), l'envoi se trace
 * sur la décision et se nomme sur la fiche, un second envoi est refusé, et
 * décider sans écrire n'envoie rien.
 */
import type { AdminOrderView, AdminShortfallLetterDraft } from "@lfd/contracts";

import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, STAFF } from "./production-day-fixture.js";
import { accountOrder, decide, report } from "./shortfall-decision-scene.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly idempotencyKey?: string;
  readonly data: unknown;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([{ token: MAILER, value: recordingMailer }]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
});

const letterPath = (orderId: string): string => `/admin/orders/${orderId}/shortfall-letter`;

async function write(orderId: string, message: string): Promise<{ status: number; code: unknown }> {
  const response = await ctx.asSub(STAFF).post(letterPath(orderId)).send({ message });
  const body: unknown = response.body;
  const code = typeof body === "object" && body !== null && "code" in body ? body.code : null;
  return { status: response.status, code };
}

const shortfallMails = (): readonly SentMail[] =>
  sentMails.filter((mail) => mail.template === "customer.order-shortfall");

/** Une commande de 3 croissants, 1 au bac, décidée « reste abandonné ». */
async function decidedOrder(): Promise<{ readonly id: string; readonly orderNumber: string }> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  return order;
}

describe("« Écrire au client » (E6d)", () => {
  it("propose le texte, envoie le texte RELU une fois, et le trace sur la décision", async () => {
    const order = await decidedOrder();

    const draft = jsonBody<AdminShortfallLetterDraft>(
      await ctx.asSub(STAFF).get(letterPath(order.id)).expect(200),
    );
    expect(draft.message).toContain(order.orderNumber);
    expect(draft.message).toContain("Ce qui part :\n– 1 ×");
    expect(draft.message).toContain("Ce qui manque :\n– 2 ×");

    const relu = `${draft.message}\n\nNous vous rappelons demain.`;
    expect((await write(order.id, relu)).status).toBe(204);

    const decision = await ctx.prisma.orderShortfallDecision.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(shortfallMails()).toEqual([
      expect.objectContaining({
        idempotencyKey: `order-shortfall:${decision.id}`,
        data: { reference: order.orderNumber, message: relu, locale: "fr" },
      }),
    ]);
    expect(decision.customerNotifiedAt).not.toBeNull();
    expect(decision.customerNotifiedByStaffId).not.toBeNull();

    const fiche = jsonBody<AdminOrderView>(
      await ctx.asSub(STAFF).get(`/admin/orders/${order.id}`).expect(200),
    );
    const notice = fiche.shortfall?.decision?.customerNotice;
    expect(notice?.notifiedAt).toBe(decision.customerNotifiedAt?.toISOString());
    expect(typeof notice?.notifiedByName).toBe("string");
  });

  it("refuse un second envoi, et la proposition une fois le client prévenu — en 409 nommés", async () => {
    const order = await decidedOrder();
    await write(order.id, "Il manque deux croissants.");

    expect(await write(order.id, "Encore une fois.")).toMatchObject({
      status: 409,
      code: "orders.shortfall_letter.already_sent",
    });
    await ctx.asSub(STAFF).get(letterPath(order.id)).expect(409);
    expect(shortfallMails()).toHaveLength(1);
  });

  it("décider sans écrire n'envoie rien", async () => {
    const order = await accountOrder(ctx, 1);
    await report(ctx, order.id);
    const before = sentMails.length;

    expect((await decide(ctx, order.id)).status).toBe(204);
    await ctx.drain();

    expect(sentMails).toHaveLength(before);
    const decision = await ctx.prisma.orderShortfallDecision.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(decision.customerNotifiedAt).toBeNull();
  });

  it("refuse d'écrire sans décision, et un texte vide", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await write(order.id, "Bonjour.")).toMatchObject({
      status: 409,
      code: "orders.shortfall_letter.not_decided",
    });
    await report(ctx, order.id);
    await decide(ctx, order.id);
    expect(await write(order.id, "   ")).toMatchObject({
      status: 400,
      code: "orders.shortfall_letter.required",
    });
    expect(shortfallMails()).toEqual([]);
  });
});
