/**
 * E2E de **« Votre livraison est en route »**
 * (`documentation/livraisons/livreur/en-route.md`) : le départ d'une tournée,
 * fait durable de la livraison (`delivery.round_departed`, DD1), écrit par
 * l'abonné du commerce.
 *
 * Ce que seul l'e2e prouve : le fait passe par la boîte d'envoi, l'abonné
 * durable le reçoit après la validation dans SA propre unité de travail, et
 * un départ annulé au moment de valider n'a pas de fait — personne n'est
 * écrit.
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
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { currentTransaction } from "../src/platform/database/transaction.store.js";
import { PrismaUnitOfWork, UnitOfWork } from "../src/platform/database/unit-of-work.js";

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

/**
 * La vraie unité de travail, que le test peut faire échouer APRÈS le travail
 * de l'unité la plus externe — donc après la publication du départ, comme une
 * validation refusée par la base. Un provider interne doublé, par exception :
 * c'est le seul moyen d'atteindre « publié, puis annulé » sans provoquer une
 * vraie panne de Postgres. Tout le reste — SQL, transaction, bus — est réel.
 */
class FailableUnitOfWork extends UnitOfWork {
  inner: UnitOfWork | null = null;
  failNextCommit = false;

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.inner === null) {
      throw new RangeError("unité de travail e2e non branchée");
    }
    if (currentTransaction() !== undefined) {
      return this.inner.run(work);
    }
    return this.inner.run(async () => {
      const result = await work();
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new RangeError("validation refusée (e2e)");
      }
      return result;
    });
  }
}
const unitOfWork = new FailableUnitOfWork();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: MAILER, value: recordingMailer },
      { token: UnitOfWork, value: unitOfWork },
    ],
  });
  unitOfWork.inner = new PrismaUnitOfWork(ctx.app.get(PrismaService));
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
    ).toEqual(orderIds.map((id) => `delivery.en_route:${id}:${roundId}`).sort());
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
      `delivery.en_route:${orderIds[1]}:${roundId}`,
    ]);
  });

  it("une commande annulée : le départ est refusé, et personne ne reçoit rien", async () => {
    const { roundId, orderIds } = await loadedRoundOfTwo();
    await ctx.prisma.order.update({ where: { id: orderIds[0] }, data: { status: "cancelled" } });

    expect((await depart(ctx, roundId)).status).toBe(409);
    await ctx.drain();

    expect(enRoute()).toEqual([]);
  });

  it("un départ dont la transaction échoue après publication n'envoie aucun courriel", async () => {
    const { roundId } = await loadedRoundOfTwo();
    // Le relais peut livrer un fait durable par une unité de travail externe —
    // celle que `failNextCommit` fait échouer : on le draine d'abord (course vue
    // le 2026-10-07 sur la remise à la porte, après B1).
    await ctx.drain();
    unitOfWork.failNextCommit = true;

    expect((await depart(ctx, roundId)).status).toBe(500);
    await ctx.drain();

    expect(enRoute()).toEqual([]);
    // Et le départ n'a pas eu lieu : rejoué, il part — et n'écrit qu'alors.
    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();
    expect(enRoute()).toHaveLength(2);
  });
});
