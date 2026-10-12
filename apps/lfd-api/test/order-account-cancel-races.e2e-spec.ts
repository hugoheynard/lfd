/**
 * E2E des **courses de l'annulation au compte** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C5.3, C5.4 ; schémas
 * `documentation/order/verrous-de-l-annulation.md`) : contre la facture du
 * mois, contre la constitution d'un lot, contre « réglée autrement » — dans
 * les deux ordres —, et les trois ensemble, sans interblocage.
 *
 * La barrière est l'enveloppe du verrou de lignes (`account.beforeRowsLock`,
 * `account.afterRowsLock`) : AVANT, le geste concurrent passe entre la
 * lecture et le verrou ; APRÈS, il attend derrière le verrou tenu
 * (`lockWaiter` le prouve dans `pg_stat_activity`).
 */
import type request from "supertest";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  account,
  accountOrder,
  afterClosure,
  bootAccountScene,
  cancelRequest,
  collectionStateOf,
  COLLECTION,
  constituteRequest,
  DAY_MS,
  entity,
  invoicedOrderIds,
  issueRequest,
  lockWaiter,
  payer,
  resetAccountScene,
  settleRequest,
  staff,
  statementPath,
} from "./order-account-cancel-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootAccountScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetAccountScene();
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;

/**
 * Le geste concurrent, lancé PENDANT que le verrou est tenu : on attend
 * qu'il soit bloqué derrière lui, sans attendre sa réponse — qui ne viendra
 * qu'après le `COMMIT` de celui qui le tient.
 */
class Barrier {
  private pending: Promise<request.Response> | null = null;

  async launch(gesture: () => request.Test): Promise<void> {
    this.pending = Promise.resolve(gesture());
    await lockWaiter();
  }

  response(): Promise<request.Response> {
    return this.pending ?? Promise.reject(new Error("la barrière n'a pas joué"));
  }
}

async function twoOrders() {
  const entityId = await entity();
  const who = await payer(entityId);
  return { entityId, first: await accountOrder(who), second: await accountOrder(who) };
}

describe("annulation × facture du mois", () => {
  it("annulée entre la préparation et le verrou : retirée du groupe, le reste est facturé", async () => {
    const { entityId, first, second } = await twoOrders();
    account.beforeRowsLock = async () => {
      await cancelRequest(first.id).expect(204);
    };

    await issueRequest(entityId).expect(200);

    expect(await invoicedOrderIds()).toEqual([second.id]);
    expect(await collectionStateOf(first.id)).toBe("cancelled");
  });

  it("l'émission tient le verrou : l'annulation attend, puis relit « facturée » et refuse", async () => {
    const { entityId, first, second } = await twoOrders();
    const barrier = new Barrier();
    account.afterRowsLock = () => barrier.launch(() => cancelRequest(first.id));

    await issueRequest(entityId).expect(200);

    const refused = await barrier.response();
    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe("orders.cancel.invoiced");
    expect(await invoicedOrderIds()).toEqual([first.id, second.id].sort());
  });

  it("un bon non facturable annulé n'est plus signalé", async () => {
    const entityId = await entity();
    const who = await payer(entityId);
    await accountOrder(who);
    const broken = await accountOrder(who, { incoherent: true });
    account.beforeRowsLock = async () => {
      await cancelRequest(broken.id).expect(204);
    };

    await issueRequest(entityId).expect(200);

    const outcome = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow();
    expect(outcome.outcome).toBe("issued");
    expect(outcome.unbillableOrders).toEqual([]);
  });
});

describe("annulation × constitution d'un lot", () => {
  beforeEach(async () => {
    await statementPath();
    afterClosure();
  });

  it("annulée entre la lecture des ids et le verrou : la relecture l'écarte, elle reste fermée", async () => {
    const { entityId, first, second } = await twoOrders();
    account.beforeRowsLock = async () => {
      await cancelRequest(first.id).expect(204);
    };

    await constituteRequest(entityId).expect(201);

    expect(await collectionStateOf(first.id)).toBe("cancelled");
    expect(await collectionStateOf(second.id)).toBe("batched");
  });

  it("la constitution tient le verrou : l'annulation attend, puis relit « dans un lot » et refuse", async () => {
    const { entityId, first } = await twoOrders();
    const barrier = new Barrier();
    account.afterRowsLock = () => barrier.launch(() => cancelRequest(first.id));

    await constituteRequest(entityId).expect(201);

    const refused = await barrier.response();
    expect(codeOf(refused)).toBe("orders.cancel.collecting");
    expect(await collectionStateOf(first.id)).toBe("batched");
  });

  it("l'aperçu ne verrouille rien : il ne bloque pas une annulation", async () => {
    const { entityId, first } = await twoOrders();
    const sentinel = () => Promise.reject(new Error("l'aperçu a pris le verrou"));
    account.beforeRowsLock = sentinel;

    const [preview, cancelled] = await Promise.all([
      staff().get(`${COLLECTION}/preview?legalEntityId=${entityId}`),
      cancelRequest(first.id),
    ]);

    expect(preview.status).toBe(200);
    expect(cancelled.status).toBe(204);
    expect(account.beforeRowsLock).toBe(sentinel);
  });
});

describe("annulation × « réglée autrement »", () => {
  it("ensemble, cinq fois : jamais `settled_otherwise` sur une commande annulée", async () => {
    const entityId = await entity();
    const who = await payer(entityId);
    for (let round = 0; round < 5; round += 1) {
      const placed = await accountOrder(who);

      const [cancelled, settled] = await Promise.all([
        cancelRequest(placed.id),
        settleRequest(placed.id),
      ]);

      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
      const won = order.status === "cancelled";
      // L'annulation gagne : « réglée » ne trouve plus la commande (404) ; le
      // règlement gagne : l'annulation relit « réglée hors prélèvement » (409).
      expect([cancelled.status, settled.status]).toEqual(won ? [204, 404] : [409, 204]);
      expect([order.status, await collectionStateOf(placed.id)]).toEqual(
        won ? ["cancelled", "cancelled"] : ["placed", "settled_otherwise"],
      );
    }
  });
});

/**
 * Régression : la constitution lisait l'état d'encaissement AVANT tout
 * verrou et le réécrivait par `saveAll` (upsert sans version) — une commande
 * réglée autrement pendant la constitution était quand même prélevée (course
 * antérieure à C5, plan C5.1, 13 ; fermée le 2026-10-12).
 */
describe("« réglée autrement » × constitution (régression)", () => {
  beforeEach(async () => {
    await statementPath();
    afterClosure();
  });

  it("réglée entre la lecture des ids et le verrou : n'entre pas au lot", async () => {
    const { entityId, first, second } = await twoOrders();
    account.beforeRowsLock = async () => {
      await settleRequest(first.id).expect(204);
    };

    await constituteRequest(entityId).expect(201);

    expect(await collectionStateOf(first.id)).toBe("settled_otherwise");
    expect(await collectionStateOf(second.id)).toBe("batched");
  });

  it("la constitution tient le verrou : le règlement attend, puis refuse une commande déjà au lot", async () => {
    const { entityId, first } = await twoOrders();
    const barrier = new Barrier();
    account.afterRowsLock = () => barrier.launch(() => settleRequest(first.id));

    await constituteRequest(entityId).expect(201);

    const refused = await barrier.response();
    expect(refused.status).toBe(409);
    expect(await collectionStateOf(first.id)).toBe("batched");
  });
});

describe("annulation, émission et constitution ensemble", () => {
  /** Des ids dont l'ordre `en_US` et l'ordre binaire diffèrent (minuscule, MAJUSCULE). */
  const idsOf = (round: number) => [
    `c5-${String(round)}-a`,
    `c5-${String(round)}-B`,
    `c5-${String(round)}-c`,
  ];

  /**
   * ⚠️ Les bases locales se disent `en_US.utf8` (`pg_database`), mais le
   * Postgres du conteneur est sur Alpine : musl n'implémente pas la
   * collation, et `ORDER BY id` y trie en BINAIRE (constaté le 2026-10-12).
   * Le tri linguistique se demande donc à ICU, pour prouver que ces ids
   * départagent les deux ordres — celui qu'une base glibc appliquerait.
   */
  it("un tri linguistique range ces ids autrement que l'ordre binaire : le test discrimine", async () => {
    const sorted = await ctx.prisma.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM unnest(${idsOf(0)}::text[]) AS t(id) ORDER BY t.id COLLATE "en-x-icu"`;
    const binary = await ctx.prisma.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM unnest(${idsOf(0)}::text[]) AS t(id) ORDER BY t.id COLLATE "C"`;

    expect(binary.map((row) => row.id)).toEqual(["c5-0-B", "c5-0-a", "c5-0-c"]);
    expect(sorted.map((row) => row.id)).not.toEqual(binary.map((row) => row.id));
  });

  it("dix fois : jamais d'interblocage (40P01), jamais de 500", async () => {
    // Les bons tombent dans le cycle que la constitution prend à cette heure
    // (celui d'AVANT la clôture facturée) : les deux gestes verrouillent les
    // mêmes lignes.
    const previousClosure = account.startsAt;
    const floorAt = new Date(previousClosure.getTime() - 60 * DAY_MS);
    await ctx.prisma.collectionFloor.update({ where: { id: true }, data: { floorAt } });
    await ctx.prisma.invoicingFloor.update({ where: { id: true }, data: { floorAt } });
    const entityId = await entity();
    for (let round = 0; round < 10; round += 1) {
      const who = await payer(entityId);
      const [, middle] = await Promise.all(idsOf(round).map((id) => accountOrder(who, { id })));
      await ctx.prisma.order.updateMany({
        where: { id: { in: idsOf(round) } },
        data: { createdAt: new Date(previousClosure.getTime() - 20 * DAY_MS) },
      });

      const responses = await Promise.all([
        issueRequest(entityId),
        constituteRequest(entityId),
        cancelRequest(middle?.id ?? ""),
      ]);

      const [issued, constituted, cancelled] = responses.map((response) => response.status);
      expect({ round, issued, constituted, cancelled }).toEqual({
        round,
        issued: 200,
        constituted: expect.any(Number) as number,
        cancelled: expect.any(Number) as number,
      });
      expect([201, 409]).toContain(constituted);
      expect([204, 409]).toContain(cancelled);
    }
  });
});
