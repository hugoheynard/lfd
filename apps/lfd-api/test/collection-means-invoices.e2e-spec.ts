/**
 * E2E du **moyen d'encaissement lu par la facture et le lot** (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, V3',
 * V4', K2, K6, K10, K13).
 *
 * Ce que seul le vrai serveur prouve : la facture d'une période au virement
 * écrit le code 58 dans `payment_means` (pas de mandat, BG-16) ; le lot relit
 * ce moyen sur la FACTURE — il ne prélève pas une facture au virement et ne
 * la compte pas « sans mandat », il prélève une facture au prélèvement même
 * si le payeur est passé au virement depuis, re-présentation comprise.
 *
 * ⚠️ Le segment « au virement depuis le début du mois » est écrit par Prisma :
 * la route date un changement d'un payeur qui a commandé à sa PROCHAINE
 * clôture, et le bon de la scène est passé avant. Même dette que les mandats
 * de la scène. Les changements suivants passent par la route. Aucune date
 * absolue : le mois est le précédent du jour du test.
 */
import type { LegalEntityView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import {
  clock,
  closesAt,
  COLLECTION,
  ctx,
  depositedLine,
  HOUR_MS,
  invoicedPayer,
  month,
  nextClosesAt,
  nextMonthConstitution,
  RETURNS,
  setUpEntity,
  signal,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";

useCollectionReturnScene();

const ENTITIES = "/admin/accounting/legal-entities";
const REASON = "Le client règle par virement, à sa demande écrite";

/** Le payeur est au virement depuis le début du mois facturé. */
async function transferSinceMonthStart(entityId: string, payerId: string): Promise<void> {
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.payerCollectionMeans.create({
    data: {
      id: `means_${payerId}`,
      legalEntityId: entityId,
      payerCompanyId: payerId,
      effectiveFrom: startsAt,
      means: "bank_transfer",
      reason: REASON,
      createdAt: startsAt,
      createdByStaffId: "staff-e2e",
    },
  });
}

async function changeMeans(entityId: string, payerId: string, means: string): Promise<void> {
  await staff()
    .put(`${ENTITIES}/${entityId}/payers/${payerId}/collection-means`)
    .send({ means, reason: REASON })
    .expect(204);
}

async function issue(entityId: string): Promise<void> {
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
}

/** Le lot du 1er, deux heures après la clôture. */
async function constitute(entityId: string, expected: 201 | 409): Promise<void> {
  clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
  await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(expected);
  await ctx.drain();
}

describe("la facture d'une période au virement (K10)", () => {
  it("code 58, aucun mandat ; le lot ne la prélève pas et ne la compte pas « sans mandat »", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await transferSinceMonthStart(entityId, payer);

    await issue(entityId);

    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: payer },
    });
    expect(invoice.paymentMeans).toEqual({ code: "58" });
    const outcome = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow({
      where: { payerCompanyId: payer },
    });
    expect(outcome).toMatchObject({ mandateId: "", mandateReference: null, invoiceId: invoice.id });

    await constitute(entityId, 409);

    expect(await ctx.prisma.collectionBatch.count()).toBe(0);
    // Ni prélevé, ni écarté : aucun état d'encaissement n'est écrit sur ses bons.
    expect(await ctx.prisma.orderCollection.count()).toBe(0);
  });

  it("« Votre facture » au virement : la référence à reporter, et ni IBAN ni BIC dans la demande (V5)", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await transferSinceMonthStart(entityId, payer);

    await issue(entityId);
    await ctx.drain();

    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: payer },
    });
    const requested = await ctx.prisma.outboxMessage.findMany({
      where: { type: "mail.requested", key: { startsWith: "mail.requested:invoice.notice:" } },
    });
    expect(requested.length).toBeGreaterThan(0);
    for (const message of requested) {
      const payload = JSON.stringify(message.payload);
      expect(payload).toContain(`"bankTransferReference":"${invoice.number}"`);
      expect(payload).toContain(`"paymentMeans":null`);
      // L'IBAN de l'entité (`setUpEntity`) ne figure que sur la facture jointe.
      expect(payload).not.toContain("FR1420041010050500013M02606");
      expect(payload).not.toContain("M02606");
    }
  });

  it("un payeur revenu au prélèvement : le bon de sa facture au virement n'est PAS prélevé", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await transferSinceMonthStart(entityId, payer);
    await issue(entityId);
    // Il a commandé : le retour au prélèvement prend effet à la clôture.
    await changeMeans(entityId, payer, "sepa_debit");

    await constitute(entityId, 409);

    expect(await ctx.prisma.collectionBatchLine.count()).toBe(0);
    expect(await ctx.prisma.orderCollection.count()).toBe(0);
  });
});

describe("la facture au prélèvement fait foi, même après un passage au virement (K2)", () => {
  it("le payeur passe au virement à la clôture : sa facture du mois est quand même prélevée", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await issue(entityId);
    await changeMeans(entityId, payer, "bank_transfer");
    const scheduled = await ctx.prisma.payerCollectionMeans.findFirstOrThrow();
    expect(scheduled.effectiveFrom).toEqual(closesAt);

    await constitute(entityId, 201);

    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: payer },
    });
    expect(invoice.paymentMeans).toMatchObject({ code: "59" });
    const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow({
      include: { invoices: true },
    });
    expect(line.invoices.map((link) => link.invoiceId)).toEqual([invoice.id]);
    expect(line.debtorCompanyId).toBe(payer);
  });

  it("re-présentée après un rejet, chez un payeur passé au virement depuis : prélevée (K6, K13)", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    const { batchId } = await depositedLine(entityId);
    const returnId = await signal(batchId);
    await staff().post(`${RETURNS}/${returnId}/represent`).expect(204);
    await changeMeans(entityId, payer, "bank_transfer");
    const scheduled = await ctx.prisma.payerCollectionMeans.findFirstOrThrow();
    expect(scheduled.effectiveFrom).toEqual(nextClosesAt);

    await nextMonthConstitution(entityId, 201);

    const lines = await ctx.prisma.collectionBatchLine.findMany({
      where: { batchId: { not: batchId } },
      include: { invoices: true },
    });
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: payer },
    });
    expect(lines.map((line) => line.invoices.map((link) => link.invoiceId))).toEqual([
      [invoice.id],
    ]);
  });
});

describe("le moyen suit le payeur sur le compte des clients (K5)", () => {
  it("un payeur au virement compte comme client de l'entité", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await transferSinceMonthStart(entityId, payer);
    await ctx.prisma.paymentMandate.updateMany({
      where: { companyId: payer },
      data: { status: "revoked" },
    });

    const view = jsonBody<LegalEntityView>(
      await staff().get(`${ENTITIES}/${entityId}`).expect(200),
    );

    // Sans mode choisi, sans mandat actif : il ne compterait pas s'il était prélevé.
    expect(view.payersWithoutModeCount).toBe(1);
  });
});
