/**
 * E2E de **l'annulation au compte face à l'histoire comptable** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C5.2 condition 5,
 * C5.4, C5.5) : le rejet bancaire passé, la ligne fermée qui fait
 * l'aller-retour, les écartées et les impayés détachés, la cohérence des
 * relevés.
 *
 * ⚠️ La re-présentation d'une ligne SOUS ARRÊTÉ est refusée par le geste
 * (`collection-returns.e2e-spec.ts`, « une ligne sous arrêté ne se
 * re-présente pas », vérifié le 2026-10-12) : la commande re-présentée est
 * ici produite par l'agrégat (`OrderCollection.represent`), seul chemin qui
 * mène à l'état que la condition 5 garde.
 */
import type request from "supertest";

import { OrderCollection } from "../src/b2b/accounting/domain/entities/order-collection.js";
import { DetachedUnpaidReader } from "../src/b2b/accounting/domain/ports/detached-unpaid.reader.js";
import { OrderCollectionRepository } from "../src/b2b/accounting/domain/ports/order-collection.repository.js";
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
  DAY_MS,
  entity,
  payer,
  resetAccountScene,
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
const collections = () => ctx.app.get(OrderCollectionRepository);

/** Sous arrêté : lot constitué, déposé, sa ligne 1 rejetée par la banque. */
async function rejectedLine(entityId: string): Promise<void> {
  await statementPath();
  afterClosure();
  await constituteRequest(entityId).expect(201);
  await ctx.drain();
  const batch = await ctx.prisma.collectionBatch.findFirstOrThrow();
  await staff().post(`${COLLECTION}/batches/${batch.id}/deposit`).expect(204);
  await staff()
    .post(`/admin/accounting/collection-returns/batches/${batch.id}/lines/1`)
    .send({
      kind: "reject",
      reasonCode: "AM04",
      reasonLabel: null,
      returnedOn: daysAgo(1).slice(0, 10),
      feeCents: 750,
    })
    .expect(201);
}

/** La re-présentation, par l'agrégat (cf. l'en-tête). */
async function represented(orderId: string): Promise<void> {
  const line = await collections().ofOrder(orderId);
  if (line === null) {
    throw new Error(`aucune ligne d'encaissement pour ${orderId}`);
  }
  line.represent(account.clock.now());
  await collections().saveAll([line]);
}

describe("le rejet bancaire passé (condition 5, défaut C5.9 bis, 3)", () => {
  it("rejetée puis re-présentée : `due`, mais refusée `returned_before`", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    await rejectedLine(entityId);
    expect(codeOf(await cancelRequest(placed.id).expect(409))).toBe("orders.cancel.collected");

    await represented(placed.id);

    expect(await collectionStateOf(placed.id)).toBe("due");
    expect(codeOf(await cancelRequest(placed.id).expect(409))).toBe(
      "orders.cancel.returned_before",
    );
  });

  it("un rejet sur la ligne d'un AUTRE bon du même payeur ne bloque pas", async () => {
    const entityId = await entity();
    const who = await payer(entityId);
    await accountOrder(who);
    await rejectedLine(entityId);
    // Passée après la clôture du lot rejeté : sur aucune de ses lignes.
    const later = await ctx.prisma.order.create({
      data: {
        orderNumber: "CMD-C5-APRES",
        companyId: who.companyId,
        placedByUserId: who.ownerId,
        subtotalCents: 1_000,
        totalCents: 1_055,
        vatCents: 55,
        paymentStatus: "not_required",
        createdAt: new Date(account.closesAt.getTime() + DAY_MS / 24),
      },
      select: { id: true },
    });

    await cancelRequest(later.id).expect(204);

    expect(await collectionStateOf(later.id)).toBe("cancelled");
  });
});

describe("la ligne fermée (C5.4)", () => {
  it("`cancelled` fait l'aller-retour ligne → agrégat → ligne, et plus rien ne la reprend", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    await cancelRequest(placed.id).expect(204);

    const loaded = await collections().ofOrder(placed.id);
    expect(loaded?.toPersistence()).toMatchObject({
      orderId: placed.id,
      state: "cancelled",
      batchId: null,
      lineRank: null,
      exclusionReason: null,
      amountCents: 10_550,
    });
    if (loaded === null) {
      return;
    }
    await collections().saveAll([loaded]);
    expect(await collectionStateOf(placed.id)).toBe("cancelled");
    expect(() =>
      loaded.settleOtherwise("virement", { at: account.clock.now(), staffId: "x" }),
    ).toThrow();
  });

  it("écartée faute de mandat, puis annulée : fermée, et le lot suivant ne l'écarte plus", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId, { mandate: false }));
    await statementPath();
    afterClosure();
    await constituteRequest(entityId);
    expect(await collectionStateOf(placed.id)).toBe("excluded");

    await cancelRequest(placed.id).expect(204);
    await constituteRequest(entityId);

    expect(await collectionStateOf(placed.id)).toBe("cancelled");
  });

  it("une impayée détachée annulée sort des impayés détachés", async () => {
    const entityId = await entity();
    const placed = await accountOrder(await payer(entityId));
    const detached = OrderCollection.due(placed.id, 10_550, account.clock.now());
    detached.exclude("payer_detached", account.clock.now());
    await collections().saveAll([detached]);
    const unpaid = () => ctx.app.get(DetachedUnpaidReader).rows();
    expect((await unpaid()).map((row) => row.orderId)).toEqual([placed.id]);

    await cancelRequest(placed.id).expect(204);

    expect(await unpaid()).toEqual([]);
  });
});

describe("cohérence des relevés", () => {
  it("toute ligne `batched` a son bon sous un relevé ACTIF de sa ligne", async () => {
    const entityId = await entity();
    const who = await payer(entityId);
    await accountOrder(who);
    const cancelled = await accountOrder(who);
    await cancelRequest(cancelled.id).expect(204);
    await statementPath();
    afterClosure();
    await constituteRequest(entityId).expect(201);

    const orphans = await ctx.prisma.$queryRaw<{ order_id: string }[]>`
      SELECT oc."order_id" FROM "public"."order_collection" oc
      WHERE oc."state" = 'batched' AND NOT EXISTS (
        SELECT 1 FROM "public"."billing_statement" bs
        JOIN "public"."billing_statement_order" bso ON bso."statement_id" = bs."id"
        WHERE bs."batch_id" = oc."batch_id" AND bs."line_rank" = oc."line_rank"
          AND bs."status" = 'active' AND bso."order_id" = oc."order_id")`;
    expect(orphans).toEqual([]);
    expect(await ctx.prisma.billingStatementOrder.count({ where: { orderId: cancelled.id } })).toBe(
      0,
    );
  });
});
