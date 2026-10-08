/**
 * E2E de **l'arrêté de facturation figé** (plan
 * `documentation/facturation/plan-le-prelevement-suit-la-facture.md`, F3).
 *
 * Ce que seul le vrai SQL prouve : l'arrêté s'écrit dans la transaction de la
 * constitution, cite sa ligne par clé étrangère, et la base le tient immuable
 * — aucune modification hors `active → cancelled`, aucune suppression, aucune
 * annulation une fois le lot déposé.
 *
 * ⚠️ Commandes et mandats écrits par Prisma : même dette que
 * `collection-batches.e2e-spec.ts`, dont ce fichier reprend la mise en place
 * (ce dernier dépasse déjà 300 lignes).
 *
 * Aucune date absolue : la clôture est le dernier 1er du mois atteint, calculé
 * par le domaine depuis l'instant présent.
 */
import type {
  BillingStatementView,
  CollectionCycleView,
  ConstitutedBatchesView,
} from "@lfd/contracts";

import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = "/admin/accounting/collection";
const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

let ctx: E2eContext;
let seq = 0;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
  await ctx.prisma.collectionFloor.create({
    data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
  });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send({ ...DEBTOR_RIB, iban: "FR1420041010050500013M02606", holder: "Crazeativity" })
    .expect(204);
  return id;
}

/** Une société cliente avec un mandat B2B actif chez l'entité. */
async function mandatedClient(entityId: string, name: string): Promise<string> {
  seq += 1;
  const { id } = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${id}/bank-account`).send(DEBTOR_RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: id,
      creditorId: entityId,
      reference: `RUM-ARR-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return id;
}

/**
 * Un bon de 100 € HT à 5,5 %, passé `daysBefore` jours avant la clôture, ou à
 * 10,5 c HT (`halfCent`) : deux de ceux-là font une facture qui s'écarte des bons.
 */
async function orderOf(companyId: string, daysBefore: number, halfCent = false): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `arrete-${String(seq)}` });
  const [unitPriceMillicents, lineTotalCents, vatCents] = halfCent
    ? [10_500, 11, 1]
    : [10_000_000, 10_000, 550];
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-ARR-${String(seq)}`,
      companyId,
      placedByUserId: user.id,
      subtotalCents: lineTotalCents,
      totalCents: lineTotalCents + vatCents,
      vatCents,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - daysBefore * DAY_MS),
      vatShares: [{ rate: 5.5, amountCents: vatCents }],
      lines: {
        create: {
          sku: "PAIN-ARR",
          productNameSnapshot: "Pain de l'arrêté",
          unitPriceMillicents,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents,
        },
      },
    },
    select: { id: true },
  });
  return order.id;
}

async function constitute(entityId: string): Promise<string> {
  const response = await staff()
    .post(`${BASE}/batches`)
    .send({ legalEntityId: entityId })
    .expect(201);
  return jsonBody<ConstitutedBatchesView>(response).batchIds[0] ?? "";
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
    const portOrders = [await orderOf(port, 2, true), await orderOf(port, 3, true)];
    const quaiOrder = await orderOf(quai, 2);

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
    // L'écart de F2 est figé : 22 c facturés pour 24 c de bons.
    expect(byPayer.get(port)).toMatchObject({ totalTtcCents: 22, ordersTotalCents: 24 });
    expect(
      byPayer
        .get(port)
        ?.orders.map((o) => o.orderId)
        .sort(),
    ).toEqual(portOrders.sort());
    expect(byPayer.get(quai)?.orders.map((o) => o.orderId)).toEqual([quaiOrder]);
    expect(byPayer.get(quai)?.buyer).toMatchObject({ companyId: quai, name: "Café du Quai" });
    expect(byPayer.get(quai)?.seller).toMatchObject({ siren: "552100554", ics: "FR72ZZZ123456" });
    expect(byPayer.get(quai)?.body).toMatchObject({ totalCents: 10_550 });
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
    await orderOf(port, 2, true);
    await orderOf(port, 3, true);
    const batchId = await constitute(entity);
    const id = (await statementsOf(batchId))[0]?.id ?? "";

    const view = jsonBody<BillingStatementView>(await staff().get(`${READ}/${id}`).expect(200));

    expect(view).toMatchObject({ status: "active", batchStatus: "constituted", lineRank: 1 });
    expect(view).toMatchObject({ totalTtcCents: 22, ordersTotalCents: 24 });
    expect(view.invoice.totalCents).toBe(view.totalTtcCents);
    expect(view.buyer.name).toBe("Boulangerie du Port");
    expect(view.orders.map((order) => order.orderNumber)).toEqual([
      expect.stringMatching(/^CMD-ARR-/u),
      expect.stringMatching(/^CMD-ARR-/u),
    ]);
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
