/**
 * E2E de **l'arrêté de facturation figé** (plan
 * `documentation/comptabilite/facturation/le-prelevement-suit-la-facture.md`).
 *
 * Ce que seul le vrai SQL prouve : l'arrêté s'écrit dans la transaction de la
 * constitution, cite sa ligne par clé étrangère, et la base le tient immuable
 * — aucune modification hors `active → cancelled`, aucune suppression, aucune
 * annulation une fois le lot déposé.
 *
 * La mise en place est celle de `collection-batch-scene.ts` : commandes
 * passées par le vrai chemin (plan T), le demi-centime par une vraie
 * mercuriale ; mandats écrits par Prisma (même dette que la scène).
 *
 * Aucune date absolue : la clôture est le dernier 1er du mois atteint, calculé
 * par le domaine depuis l'instant présent.
 */
import type { BillingStatementView, CollectionCycleView } from "@lfd/contracts";

import { jsonBody } from "./e2e-harness.js";
import {
  BASE,
  client,
  collectingEntity,
  ctx,
  HALF_CENT_BON,
  mandated,
  orderOf,
  staff,
  constitute as constituteAll,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

/** Une société cliente avec un mandat B2B actif chez l'entité. */
async function mandatedClient(entityId: string, name: string): Promise<string> {
  const id = await client(name);
  await mandated(entityId, id);
  return id;
}

async function constitute(entityId: string): Promise<string> {
  return (await constituteAll(entityId))[0] ?? "";
}

async function statementsOf(batchId: string) {
  return ctx.prisma.billingStatement.findMany({
    where: { batchId },
    orderBy: { lineRank: "asc" },
    include: { orders: { select: { orderId: true } }, line: true },
  });
}

describe("l'arrêté de facturation (F3)", () => {
  it("la constitution fige un arrêté actif par ligne : total = montant de la ligne, bons rattachés", async () => {
    const entity = await collectingEntity();
    const port = await mandatedClient(entity, "Boulangerie du Port");
    const quai = await mandatedClient(entity, "Café du Quai");
    const portOrders = [
      (await orderOf(port, 2, HALF_CENT_BON)).id,
      (await orderOf(port, 3, HALF_CENT_BON)).id,
    ];
    const quaiBon = await orderOf(quai, 2);
    const quaiOrder = quaiBon.id;

    const batchId = await constitute(entity);

    const statements = await statementsOf(batchId);
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.status).toBe("active");
      expect(statement.totalTtcCents).toBe(statement.line.amountCents);
      expect(statement.ordersTotalCents).toBe(statement.line.ordersTotalCents);
      expect(statement.totalHtCents + statement.totalVatCents).toBe(statement.totalTtcCents);
    }
    const byPayer = new Map(statements.map((statement) => [statement.payerCompanyId, statement]));
    // L'écart est figé : 23 c facturés pour 24 c de bons — le HT est repris
    // des bons (F6), seule la TVA calculée une fois s'en écarte.
    expect(byPayer.get(port)).toMatchObject({
      totalTtcCents: 23,
      ordersTotalCents: 24,
      totalHtCents: 22,
      computedWith: "invoice-dossier/2026-10-08-f6",
    });
    expect(
      byPayer
        .get(port)
        ?.orders.map((o) => o.orderId)
        .sort(),
    ).toEqual(portOrders.sort());
    expect(byPayer.get(quai)?.orders.map((o) => o.orderId)).toEqual([quaiOrder]);
    expect(byPayer.get(quai)?.buyer).toMatchObject({ companyId: quai, name: "Café du Quai" });
    expect(byPayer.get(quai)?.seller).toMatchObject({ siren: "552100554", ics: "FR72ZZZ123456" });
    expect(byPayer.get(quai)?.body).toMatchObject({ totalCents: quaiBon.totalCents });
    const view = jsonBody<CollectionCycleView>(
      await staff().get(`${BASE}/cycle?legalEntityId=${entity}`).expect(200),
    );
    expect(view.batches[0]?.lines.map((line) => line.billingStatementId)).toEqual(
      statements.map((statement) => statement.id),
    );
  });

  it("annuler le lot passe ses arrêtés `cancelled` ; reconstituer en fige de nouveaux", async () => {
    const entity = await collectingEntity();
    const port = await mandatedClient(entity, "Boulangerie du Port");
    await orderOf(port, 2);
    const first = await constitute(entity);

    await staff().post(`${BASE}/batches/${first}/cancel`).expect(204);

    expect((await statementsOf(first)).map((statement) => statement.status)).toEqual(["cancelled"]);
    const second = await constitute(entity);
    const renewed = await statementsOf(second);
    expect(renewed.map((statement) => statement.status)).toEqual(["active"]);
    expect(renewed[0]?.id).not.toBe((await statementsOf(first))[0]?.id);
    await ctx.drain();
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "billing_statement." } },
      orderBy: { id: "asc" },
      select: { type: true, subjectId: true },
    });
    const firstId = (await statementsOf(first))[0]?.id;
    expect(journal).toEqual([
      { type: "billing_statement.issued", subjectId: firstId },
      { type: "billing_statement.cancelled", subjectId: firstId },
      { type: "billing_statement.issued", subjectId: renewed[0]?.id },
    ]);
  });

  it("la base refuse de retoucher, de supprimer, ou d'annuler l'arrêté d'un lot déposé", async () => {
    const entity = await collectingEntity();
    const port = await mandatedClient(entity, "Boulangerie du Port");
    await orderOf(port, 2);
    const batchId = await constitute(entity);
    const [statement] = await statementsOf(batchId);
    const id = statement?.id ?? "";

    await expect(
      ctx.prisma.billingStatement.update({ where: { id }, data: { totalTtcCents: 1 } }),
    ).rejects.toThrow(/billing_statement_immutable/u);
    await expect(ctx.prisma.billingStatement.delete({ where: { id } })).rejects.toThrow(
      /billing_statement_immutable/u,
    );
    await expect(
      ctx.prisma.billingStatementOrder.deleteMany({ where: { statementId: id } }),
    ).rejects.toThrow(/billing_statement_order_immutable/u);
    await staff().get(`${BASE}/batches/${batchId}/file.xml`).expect(200);
    await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(204);
    await staff().post(`${BASE}/batches/${batchId}/cancel`).expect(409);
    await expect(
      ctx.prisma.billingStatement.update({ where: { id }, data: { status: "cancelled" } }),
    ).rejects.toThrow(/n'est plus constitué/u);
    expect((await statementsOf(batchId))[0]?.status).toBe("active");
  });
});

describe("la relecture d'un arrêté (F4)", () => {
  const READ = "/admin/accounting/billing-statements";

  it("rend la facture figée, ses totaux et ses bons — et dit l'arrêté annulé avec son lot", async () => {
    const entity = await collectingEntity();
    const port = await mandatedClient(entity, "Boulangerie du Port");
    const bons = [await orderOf(port, 2, HALF_CENT_BON), await orderOf(port, 3, HALF_CENT_BON)];
    const batchId = await constitute(entity);
    const id = (await statementsOf(batchId))[0]?.id ?? "";

    const view = jsonBody<BillingStatementView>(await staff().get(`${READ}/${id}`).expect(200));

    expect(view).toMatchObject({ status: "active", batchStatus: "constituted", lineRank: 1 });
    expect(view).toMatchObject({ totalTtcCents: 23, ordersTotalCents: 24, gapCents: -1 });
    expect(view.invoice.totalCents).toBe(view.totalTtcCents);
    expect(view.buyer.name).toBe("Boulangerie du Port");
    expect(view.orders.map((order) => order.orderNumber).sort()).toEqual(
      bons.map((bon) => bon.orderNumber).sort(),
    );
    await staff().post(`${BASE}/batches/${batchId}/cancel`).expect(204);
    const cancelled = jsonBody<BillingStatementView>(
      await staff().get(`${READ}/${id}`).expect(200),
    );
    expect(cancelled).toMatchObject({ status: "cancelled", batchStatus: "cancelled" });
  });

  it("un arrêté inconnu est un 404 ; sans la lecture comptable, un 403", async () => {
    await staff().get(`${READ}/inconnu`).expect(404);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "support",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: "staff-support",
      },
    });
    await ctx.asSub("staff-support").get(`${READ}/inconnu`).expect(403);
  });
});
