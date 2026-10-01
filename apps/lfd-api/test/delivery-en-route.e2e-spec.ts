/**
 * E2E de **« Votre livraison est en route »**
 * (`documentation/livraisons/plan-en-route.md`, PL3) : le départ d'une
 * tournée, annoncé par la livraison, écrit par le commerce.
 *
 * Ce que seul l'e2e prouve : le câblage du port à travers la racine de
 * composition, et que l'abonné lit les commandes HORS de la transaction du
 * départ — sans quoi ses lectures viseraient un client de transaction clos.
 */
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  assign,
  forgetCustomer,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import { composedOrder, declareBins, depart, loadBin } from "./delivery-loading-scene.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";

const DAY = serviceDay();

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
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: MAILER, value: recordingMailer }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  sentMails.splice(0);
});

/** Une tournée de deux commandes, chacune d'un bac chargé. */
async function loadedRoundOfTwo(): Promise<{
  readonly roundId: string;
  readonly orderIds: readonly [string, string];
}> {
  const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
  const second = await seedDelivery(ctx, DAY);
  await assign(ctx, DAY, roundId, second.id);
  for (const orderId of [order.id, second.id]) {
    const [binId] = await declareBins(ctx, orderId, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
  }
  return { roundId, orderIds: [order.id, second.id] };
}

function enRoute(): readonly SentMail[] {
  return sentMails.filter((mail) => mail.template === "customer.delivery-en-route");
}

describe("votre livraison est en route (PL3)", () => {
  it("le départ d'une tournée de deux commandes rend deux courriels, un par commande", async () => {
    const { roundId, orderIds } = await loadedRoundOfTwo();

    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    expect(
      enRoute()
        .map((mail) => mail.idempotencyKey)
        .sort(),
    ).toEqual(orderIds.map((id) => `delivery.en_route:${id}`).sort());
    expect(enRoute().every((mail) => mail.to === "r@col.fr")).toBe(true);
  });

  it("un départ rejoué est refusé et n'en rend pas de second", async () => {
    const { roundId } = await loadedRoundOfTwo();
    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    expect((await depart(ctx, roundId)).status).toBe(409);
    await ctx.drain();

    expect(enRoute()).toHaveLength(2);
  });

  it("une commande déjà retirée ne reçoit rien ; l'autre, si", async () => {
    const { roundId, orderIds } = await loadedRoundOfTwo();
    await ctx.prisma.order.update({
      where: { id: orderIds[0] },
      data: { handedOverAt: new Date() },
    });

    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    expect(enRoute().map((mail) => mail.idempotencyKey)).toEqual([
      `delivery.en_route:${orderIds[1]}`,
    ]);
  });

  it("une commande annulée : le départ est refusé, et personne ne reçoit rien", async () => {
    const { roundId, orderIds } = await loadedRoundOfTwo();
    await ctx.prisma.order.update({ where: { id: orderIds[0] }, data: { status: "cancelled" } });

    expect((await depart(ctx, roundId)).status).toBe(409);
    await ctx.drain();

    expect(enRoute()).toEqual([]);
  });
});
