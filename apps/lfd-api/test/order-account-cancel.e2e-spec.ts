/**
 * E2E de **l'annulation d'une commande AU COMPTE par l'équipe** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, lot C5) : les gestes
 * et les refus nommés, sur le vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : la ligne d'encaissement FERMÉE dans la
 * transaction (`order_collection.state = cancelled`, valeur d'enum neuve), la
 * commande absente ensuite de la facture et du lot, et chaque refus lu sur
 * les vraies tables comptables — facture, lot, retour, règlement.
 *
 * Défauts métier appliqués (C5.9 bis) : lot non déposé, facturée,
 * re-présentée → refus. La scène est partagée avec les courses.
 */
import type request from "supertest";

import { daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  account,
  accountOrder,
  afterClosure,
  bootAccountScene,
  cancelRequest,
  collectionStateOf,
  COLLECTION,
  constituteRequest,
  deliver,
  entity,
  invoicedOrderIds,
  issueRequest,
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
const messageOf = (response: request.Response) =>
  jsonBody<{ readonly message: string }>(response).message;

/** Lot constitué sous arrêté (sans facture), rendu avec sa ligne. */
async function batchedUnderStatement(entityId: string): Promise<string> {
  await statementPath();
  afterClosure();
  await constituteRequest(entityId).expect(201);
  await ctx.drain();
  return (await ctx.prisma.collectionBatch.findFirstOrThrow()).id;
}

describe("annuler une commande au compte : rien d'engagé", () => {
  it("204 : ligne d'encaissement fermée, ni facturée ni prélevée, un courriel « au compte », le régime au journal", async () => {
    const entityId = await entity();
    const who = await payer(entityId);
    const cancelled = await accountOrder(who);
    const kept = await accountOrder(who);

    await cancelRequest(cancelled.id).expect(204);
    await deliver();

    expect(await collectionStateOf(cancelled.id)).toBe("cancelled");
    expect(account.mails.filter((mail) => mail.template === "customer.order-cancelled")).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ regime: "account" }) as object }),
    ]);
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "order.cancelled" } });
    expect(journal.map((event) => event.payload)).toEqual([
      expect.objectContaining({ orderId: cancelled.id, regime: "account" }),
    ]);

    await issueRequest(entityId).expect(200);
    expect(await invoicedOrderIds()).toEqual([kept.id]);
    afterClosure();
    await constituteRequest(entityId).expect(201);
    expect(await collectionStateOf(cancelled.id)).toBe("cancelled");
    expect(await collectionStateOf(kept.id)).toBe("batched");
  });

  it("un lot annulé avant dépôt rend la commande annulable", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    const batchId = await batchedUnderStatement(entityId);
    await staff().post(`${COLLECTION}/batches/${batchId}/cancel`).expect(204);

    await cancelRequest(placed.id).expect(204);

    expect(await collectionStateOf(placed.id)).toBe("cancelled");
  });
});

describe("annuler une commande au compte : les refus nommés (C5.6)", () => {
  it("facturée : 409 qui nomme la facture, rien ne bouge", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    await issueRequest(entityId).expect(200);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow();

    const refused = await cancelRequest(placed.id).expect(409);

    expect(codeOf(refused)).toBe("orders.cancel.invoiced");
    expect(messageOf(refused)).toContain(`(facture n° ${invoice.number})`);
    expect(messageOf(refused)).toContain("il faut un avoir");
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).status).toBe(
      "placed",
    );
  });

  it("dans un lot non déposé : 409 qui dit d'annuler le lot d'abord (défaut C5.9 bis, 1)", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    await batchedUnderStatement(entityId);

    const refused = await cancelRequest(placed.id).expect(409);

    expect(codeOf(refused)).toBe("orders.cancel.collecting");
    expect(messageOf(refused)).toContain("Annulez d'abord ce lot");
    expect(await collectionStateOf(placed.id)).toBe("batched");
  });

  it("prélevée : 409", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    const batchId = await batchedUnderStatement(entityId);
    await staff().post(`${COLLECTION}/batches/${batchId}/deposit`).expect(204);

    const refused = await cancelRequest(placed.id).expect(409);

    expect(codeOf(refused)).toBe("orders.cancel.collected");
    expect(await collectionStateOf(placed.id)).toBe("collected");
  });

  it("passée en perte après un rejet : 409", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    const batchId = await batchedUnderStatement(entityId);
    await staff().post(`${COLLECTION}/batches/${batchId}/deposit`).expect(204);
    const returned = await staff()
      .post(`/admin/accounting/collection-returns/batches/${batchId}/lines/1`)
      .send({
        kind: "reject",
        reasonCode: "AM04",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: 750,
      })
      .expect(201);
    await staff()
      .post(
        `/admin/accounting/collection-returns/${jsonBody<{ id: string }>(returned).id}/write-off`,
      )
      .send({ note: "irrécouvrable" })
      .expect(204);

    const refused = await cancelRequest(placed.id).expect(409);

    expect(codeOf(refused)).toBe("orders.cancel.written_off");
  });

  it("réglée autrement : 409 ; et l'inverse, une annulée ne se règle plus autrement", async () => {
    const entityId = await entity();
    const who = await payer(entityId);
    const settled = await accountOrder(who);
    const cancelled = await accountOrder(who);
    await settleRequest(settled.id).expect(204);
    await cancelRequest(cancelled.id).expect(204);

    const refused = await cancelRequest(settled.id).expect(409);
    await settleRequest(cancelled.id).expect(404);

    expect(codeOf(refused)).toBe("orders.cancel.settled_otherwise");
    expect(await collectionStateOf(cancelled.id)).toBe("cancelled");
  });
});
