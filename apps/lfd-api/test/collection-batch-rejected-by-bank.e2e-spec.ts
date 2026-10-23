/**
 * E2E du **lot rejeté par la banque** (plan
 * `documentation/comptabilite/prelevement/plan-lot-rejete-par-la-banque.md`).
 *
 * Ce que seul le vrai SQL prouve, et qui traverse les VRAIS déclencheurs et
 * contraintes : le CHECK du dépôt qui admet un lot rejeté, l'index « un lot
 * vivant par clôture » qui laisse reconstituer, le déclencheur de transition
 * (`rejected_by_bank` depuis `deposited` seulement, terminal), le
 * déclencheur des arrêtés qui laisse annuler ceux d'un lot rejeté — et
 * jamais deux débits vivants pour une même commande.
 *
 * ⚠️ Commandes, mandats, plancher : écrits par Prisma, même dette que
 * `collection-returns-scene.ts`, dont la scène est reprise. Aucune date
 * absolue : le mois est le PRÉCÉDENT du jour du test, l'horloge FIXE est
 * posée relativement à lui.
 */
import type { CollectionCycleView, MyIssuedInvoicesView } from "@lfd/contracts";

import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { invoicedPayer, setUpEntity } from "./collection-returns-scene.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createUser } from "./factories.js";

const HOUR_MS = 60 * 60 * 1000;
const COLLECTION = "/admin/accounting/collection";
const RETURNS = "/admin/accounting/collection-returns";
const REASON = "PSR1 : fichier refusé, schéma invalide";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};
const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  clock.set(new Date(invoicingMomentOf(closesAt).getTime() + 2 * 60 * 1000));
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: month.cycle().startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Le régime « facture du mois » (E4) : le plancher de la facture posé, la facture émise. */
async function issueMonthlyInvoice(entityId: string): Promise<void> {
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: month.cycle().startsAt } });
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
}

/** Lot du 1er, avis partis, fichier téléchargé, lot déposé : rend son id. */
async function depositedBatch(entityId: string): Promise<string> {
  clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
  await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
  await ctx.drain();
  const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
    where: { status: "constituted" },
  });
  await staff().get(`${COLLECTION}/batches/${batch.id}/file.xml`).expect(200);
  await staff().post(`${COLLECTION}/batches/${batch.id}/deposit`).expect(204);
  return batch.id;
}

function reject(batchId: string, reason = REASON) {
  return staff()
    .post(`${COLLECTION}/batches/${batchId}/rejected-by-bank`)
    .send({ attested: true, reason });
}

describe("« La banque a rejeté ce fichier »", () => {
  it("déposé → rejeté → la même clôture se reconstitue, sous de nouvelles lignes, jamais deux débits", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    const batchId = await depositedBatch(entityId);
    const before = await ctx.prisma.collectionBatchLine.findFirstOrThrow({ where: { batchId } });

    await reject(batchId).expect(204);

    const rejected = await ctx.prisma.collectionBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(rejected).toMatchObject({ status: "rejected_by_bank", rejectionReason: REASON });
    expect(rejected.depositedAt).not.toBeNull();
    expect(rejected.rejectedAt).toEqual(clock.now());
    const orders = await ctx.prisma.orderCollection.findMany();
    expect(orders.map((row) => [row.state, row.batchId])).toEqual([["due", null]]);

    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
    await ctx.drain();

    const batches = await ctx.prisma.collectionBatch.findMany({
      orderBy: { constitutedAt: "asc" },
    });
    expect(batches.map((batch) => batch.status)).toEqual(["rejected_by_bank", "constituted"]);
    expect(batches[1]?.cycleClosesAt).toEqual(batches[0]?.cycleClosesAt);
    const after = await ctx.prisma.collectionBatchLine.findFirstOrThrow({
      where: { batchId: batches[1]?.id ?? "" },
    });
    expect(after.endToEndId).not.toBe(before.endToEndId);
    const live = await ctx.prisma.collectionBatchLineInvoice.findMany({
      where: { line: { batch: { status: { notIn: ["cancelled", "rejected_by_bank"] } } } },
    });
    expect(live).toHaveLength(1);
    const reloaded = await ctx.prisma.orderCollection.findMany();
    expect(reloaded.map((row) => [row.state, row.batchId])).toEqual([["batched", batches[1]?.id]]);
  });

  it("le journal le dit, l'écran du cycle nomme l'auteur, le fichier se retélécharge préfixé REJETE-", async () => {
    await ctx.prisma.staffUser.update({
      where: { auth0Id: "staff-e2e" },
      data: { firstName: "Claire", lastName: "Compta" },
    });
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    const batchId = await depositedBatch(entityId);

    await reject(batchId).expect(204);

    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.batch_rejected_by_bank" },
    });
    expect(fact.payload).toMatchObject({ reason: REASON, releasedOrderCount: 1 });
    const cycle = jsonBody<CollectionCycleView>(
      await staff().get(`${COLLECTION}/cycle?legalEntityId=${entityId}`).expect(200),
    );
    expect(cycle.batches[0]).toMatchObject({
      status: "rejected_by_bank",
      rejection: { reason: REASON, byName: "Claire Compta" },
    });
    const file = await staff().get(`${COLLECTION}/batches/${batchId}/file.xml`).expect(200);
    expect(String(file.headers["content-disposition"])).toContain("REJETE-");
  });

  it("« Mes factures » ne dit plus la facture prélevée", async () => {
    const entityId = await setUpEntity(staff);
    const companyId = await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    const user = await createUser(ctx.prisma, { auth0Sub: "rej-compta", email: "c@port.test" });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.billing);
    const list = async (): Promise<MyIssuedInvoicesView> =>
      jsonBody<MyIssuedInvoicesView>(
        await ctx.asSub("rej-compta").get(`/companies/${companyId}/invoices`).expect(200),
      );
    const batchId = await depositedBatch(entityId);
    expect((await list()).invoices[0]?.settlement?.status).toBe("collected");

    await reject(batchId).expect(204);

    const after = await list();
    expect(after.invoices[0]?.settlement?.status).toBe("collection_planned");
    expect(after.amountDue.totalCents).toBeGreaterThan(0);
  });

  it("refuse si une ligne a un retour : 409, le lot reste déposé", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    const batchId = await depositedBatch(entityId);
    await staff()
      .post(`${RETURNS}/batches/${batchId}/lines/1`)
      .send({
        kind: "reject",
        reasonCode: "AM04",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: null,
      })
      .expect(201);

    const refused = await reject(batchId).expect(409);

    expect(JSON.stringify(refused.body)).toContain("Boulangerie du Port");
    const batch = await ctx.prisma.collectionBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe("deposited");
  });

  it("refuse un lot préparé (409), un motif vide (400), l'échéance atteinte (409)", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
    await ctx.drain();
    const prepared = await ctx.prisma.collectionBatch.findFirstOrThrow();
    await reject(prepared.id).expect(409);
    await staff()
      .post(`${COLLECTION}/batches/${prepared.id}/rejected-by-bank`)
      .send({ attested: false, reason: REASON })
      .expect(400);

    await staff().get(`${COLLECTION}/batches/${prepared.id}/file.xml`).expect(200);
    await staff().post(`${COLLECTION}/batches/${prepared.id}/deposit`).expect(204);
    await reject(prepared.id, "   ").expect(400);
    const day = prepared.requestedCollectionDay?.toISOString().slice(0, 10) ?? "";
    clock.set(new Date(`${day}T08:00:00.000Z`));
    await reject(prepared.id).expect(409);
    const batch = await ctx.prisma.collectionBatch.findUniqueOrThrow({
      where: { id: prepared.id },
    });
    expect(batch.status).toBe("deposited");
  });

  it("un retour sur un lot rejeté : 409 qui dit le double débit possible et qui a déclaré le rejet", async () => {
    await ctx.prisma.staffUser.update({
      where: { auth0Id: "staff-e2e" },
      data: { firstName: "Claire", lastName: "Compta" },
    });
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    const batchId = await depositedBatch(entityId);
    await reject(batchId).expect(204);

    const refused = await staff()
      .post(`${RETURNS}/batches/${batchId}/lines/1`)
      .send({
        kind: "reject",
        reasonCode: "AM04",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: null,
      })
      .expect(409);

    const message = JSON.stringify(refused.body);
    expect(message).toContain("déclaré rejeté par la banque");
    expect(message).toContain("débité deux fois");
    expect(message).toContain("par Claire Compta le");
    expect(await ctx.prisma.collectionReturn.count()).toBe(0);
  });
});

describe("la base tient la transition", () => {
  it("`rejected_by_bank` ne s'atteint que depuis `deposited`, et n'en sort pas", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    await issueMonthlyInvoice(entityId);
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
    await ctx.drain();
    const { id } = await ctx.prisma.collectionBatch.findFirstOrThrow();
    const rejection = {
      status: "rejected_by_bank" as const,
      depositedAt: clock.now(),
      depositedByStaffId: "staff_x",
      rejectedAt: clock.now(),
      rejectedByStaffId: "staff_x",
      rejectionReason: REASON,
    };

    await expect(
      ctx.prisma.collectionBatch.update({ where: { id }, data: rejection }),
    ).rejects.toThrow(/seul un lot déposé peut être rejeté/u);

    await staff().get(`${COLLECTION}/batches/${id}/file.xml`).expect(200);
    await staff().post(`${COLLECTION}/batches/${id}/deposit`).expect(204);
    await expect(
      ctx.prisma.collectionBatch.update({
        where: { id },
        data: { status: "rejected_by_bank" },
      }),
    ).rejects.toThrow(/collection_batch_rejected_is_signed/u);
    await reject(id).expect(204);
    await expect(
      ctx.prisma.collectionBatch.update({ where: { id }, data: { status: "deposited" } }),
    ).rejects.toThrow(/définitif/u);
    await expect(
      ctx.prisma.collectionBatch.update({ where: { id }, data: { rejectionReason: "autre" } }),
    ).rejects.toThrow(/définitif/u);
  });

  /** Sans plancher de facture : le lot fige des arrêtés (F3), que le rejet annule. */
  it("les arrêtés d'un lot rejeté s'annulent ; ceux d'un lot déposé, jamais", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const batchId = await depositedBatch(entityId);
    const [statement] = await ctx.prisma.billingStatement.findMany({ where: { batchId } });
    expect(statement?.status).toBe("active");
    await expect(
      ctx.prisma.billingStatement.update({
        where: { id: statement?.id ?? "" },
        data: { status: "cancelled" },
      }),
    ).rejects.toThrow(/n'est plus constitué/u);

    await reject(batchId).expect(204);

    const after = await ctx.prisma.billingStatement.findMany({ where: { batchId } });
    expect(after.map((row) => row.status)).toEqual(["cancelled"]);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { in: ["collection.batch_rejected_by_bank", "billing_statement.cancelled"] } },
      orderBy: { occurredAt: "asc" },
    });
    expect(facts.map((fact) => fact.type).sort()).toEqual([
      "billing_statement.cancelled",
      "collection.batch_rejected_by_bank",
    ]);
  });
});
