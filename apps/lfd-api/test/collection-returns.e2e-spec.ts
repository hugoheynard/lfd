/**
 * E2E des **retours bancaires** (plan
 * `documentation/comptabilite/prelevement/retours-bancaires.md`).
 *
 * Ce que seul le vrai SQL prouve : le CHECK qui admet `returned` avec sa
 * ligne ; une commande retournée n'entre plus dans la constitution ;
 * re-présentée, elle entre au lot suivant et son avis dit le jour du rejet ;
 * les refus sous arrêté, sous mandat révoqué, en remboursement B2B ; l'import
 * pain.002 / camt.054, aperçu puis confirmation ; 403 en lecture seule.
 *
 * ⚠️ Commandes, mandats, plancher : écrits par Prisma, même dette que
 * `monthly-invoices.e2e-spec.ts`. Aucune date absolue : le mois est le
 * PRÉCÉDENT du jour du test, et l'horloge FIXE est posée relativement à lui.
 */
import type {
  BatchCollectionReturnsView,
  CollectionReturnImportPreviewView,
  CollectionReturnView,
} from "@lfd/contracts";

import {
  camt054,
  pain002,
} from "../src/b2b/accounting/domain/services/__tests__/bank-return-file-fixtures.js";
import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/monthly-invoicing.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { invoicedPayer, readerStaff, setUpEntity } from "./collection-returns-scene.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const COLLECTION = "/admin/accounting/collection";
const RETURNS = "/admin/accounting/collection-returns";

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
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
let month: StatementMonth;
let closesAt: Date;
let nextClosesAt: Date;

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
  month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  nextClosesAt = StatementMonth.containing(new Date(closesAt.getTime() + DAY_MS)).cycle().closesAt;
  // Le dernier jour, 23h57 à Paris : la facture du mois est due (E4b).
  clock.set(new Date(invoicingMomentOf(month).getTime() + 2 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Facture du mois, lot du 1er, avis partis, lot déposé : rend le lot et sa ligne. */
async function depositedLine(entityId: string): Promise<{ batchId: string; e2e: string }> {
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, month: month.toString() })
    .expect(200);
  clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
  await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
  await ctx.drain();
  const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow();
  await staff().post(`${COLLECTION}/batches/${line.batchId}/deposit`).expect(204);
  return { batchId: line.batchId, e2e: line.endToEndId };
}

async function signal(batchId: string, kind = "reject", reasonCode = "AM04"): Promise<string> {
  const response = await staff()
    .post(`${RETURNS}/batches/${batchId}/lines/1`)
    .send({
      kind,
      reasonCode,
      reasonLabel: null,
      returnedOn: daysAgo(1).slice(0, 10),
      feeCents: 750,
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Le mois suivant clos : le lot du 1er. */
async function nextMonthConstitution(entityId: string, expected: 201 | 409): Promise<void> {
  clock.set(new Date(nextClosesAt.getTime() + 2 * HOUR_MS));
  await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(expected);
  await ctx.drain();
}

describe("les retours bancaires (R5a)", () => {
  it("rejet → returned, absent du lot suivant ; re-présenté → présent, avis « nouvelle présentation »", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    const { batchId } = await depositedLine(entityId);

    const returnId = await signal(batchId);

    const states = await ctx.prisma.orderCollection.findMany();
    expect(states.map((row) => [row.state, row.batchId])).toEqual([["returned", batchId]]);
    const listed = jsonBody<BatchCollectionReturnsView>(
      await staff().get(`${RETURNS}/batches/${batchId}`).expect(200),
    );
    expect(listed.returns[0]).toMatchObject({
      id: returnId,
      resolution: "pending",
      reason: "Provision insuffisante",
    });
    expect(listed.returns[0]?.gestures?.representRefusal).toBeNull();
    await nextMonthConstitution(entityId, 409);

    await staff().post(`${RETURNS}/${returnId}/represent`).expect(204);
    await nextMonthConstitution(entityId, 201);

    const lines = await ctx.prisma.collectionBatchLine.findMany({
      where: { batchId: { not: batchId } },
    });
    expect(lines).toHaveLength(1);
    const notice = await ctx.prisma.collectionNotice.findFirstOrThrow({
      where: { batchId: lines[0]?.batchId ?? "" },
    });
    expect(notice.representedRejectionDay?.toISOString().slice(0, 10)).toBe(
      daysAgo(1).slice(0, 10),
    );
    const ofPayer = jsonBody<CollectionReturnView[]>(
      await staff().get(`${RETURNS}/payers/${payer}`).expect(200),
    );
    expect(ofPayer.map((item) => item.resolution)).toEqual(["represented"]);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "collection.return" } },
    });
    expect(facts.map((fact) => fact.type).sort()).toEqual([
      "collection.return_resolved",
      "collection.returned",
    ]);
  });

  it("un second retour sur la même ligne : 409", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { batchId } = await depositedLine(entityId);
    await signal(batchId);

    await staff()
      .post(`${RETURNS}/batches/${batchId}/lines/1`)
      .send({
        kind: "reject",
        reasonCode: "AM04",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: null,
      })
      .expect(409);
  });

  it("re-présenter est refusé sous mandat révoqué ; passer en perte reste possible", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    const { batchId } = await depositedLine(entityId);
    const returnId = await signal(batchId, "reject", "MD01");
    await ctx.prisma.paymentMandate.updateMany({
      where: { companyId: payer },
      data: { status: "revoked" },
    });

    const refused = await staff().post(`${RETURNS}/${returnId}/represent`).expect(409);
    expect(refused.text).toContain("nouvelle signature");
    await staff()
      .post(`${RETURNS}/${returnId}/write-off`)
      .send({ note: "société liquidée" })
      .expect(204);

    const states = await ctx.prisma.orderCollection.findMany();
    expect(states.map((row) => [row.state, row.batchId])).toEqual([["written_off", null]]);
  });

  it("re-présenter est refusé pour un mandat ponctuel consommé", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt, { paymentType: "one_off" });
    const { batchId } = await depositedLine(entityId);
    const returnId = await signal(batchId);

    const refused = await staff().post(`${RETURNS}/${returnId}/represent`).expect(409);
    expect(refused.text).toContain("ponctuel");
  });

  it("une ligne sous arrêté ne se re-présente pas ; régler autrement la sort", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    // Le bon est d'avant la facture du mois : sa ligne porte un arrêté.
    await ctx.prisma.invoicingFloor.update({ where: { id: true }, data: { floorAt: closesAt } });
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
    await ctx.drain();
    const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow({
      include: { statement: true },
    });
    expect(line.statement).not.toBeNull();
    await staff().post(`${COLLECTION}/batches/${line.batchId}/deposit`).expect(204);
    const returnId = await signal(line.batchId);

    const refused = await staff().post(`${RETURNS}/${returnId}/represent`).expect(409);
    expect(refused.text).toContain("arrêté");
    await staff()
      .post(`${RETURNS}/${returnId}/settle-otherwise`)
      .send({ note: "virement reçu" })
      .expect(204);
    const states = await ctx.prisma.orderCollection.findMany();
    expect(states.map((row) => [row.state, row.settledNote])).toEqual([
      ["settled_otherwise", "virement reçu"],
    ]);
  });

  it("un remboursement demandé sur un lot B2B : 409, rien ne bouge", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { batchId } = await depositedLine(entityId);

    await staff()
      .post(`${RETURNS}/batches/${batchId}/lines/1`)
      .send({
        kind: "refund_request",
        reasonCode: "MD06",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: null,
      })
      .expect(409);
    expect((await ctx.prisma.orderCollection.findMany()).map((row) => row.state)).toEqual([
      "collected",
    ]);
  });
});

describe("l'import d'un fichier de la banque (R5b)", () => {
  function upload(path: string, xml: string, ids?: readonly string[]) {
    const request = staff()
      .post(`${RETURNS}/import/${path}`)
      .attach("file", Buffer.from(xml), "retours.xml");
    return ids === undefined ? request : request.field("endToEndIds", JSON.stringify(ids));
  }

  it("pain.002 : aperçu (apparié, inconnu), confirmation, puis « déjà retourné »", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { e2e } = await depositedLine(entityId);
    const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow();
    const amount = (line.amountCents / 100).toFixed(2);
    const xml = pain002(daysAgo(1).slice(0, 10), [
      { endToEndId: e2e, amount, code: "AC04" },
      { endToEndId: "INCONNU-1", amount: "1.00", code: "AM04" },
    ]);

    const preview = jsonBody<CollectionReturnImportPreviewView>(
      await upload("preview", xml).expect(200),
    );
    expect(preview.entries.map((entry) => [entry.endToEndId, entry.status])).toEqual([
      [e2e, "matched"],
      ["INCONNU-1", "unknown"],
    ]);
    await upload("confirm", xml, [e2e]).expect(201);
    expect(await ctx.prisma.collectionReturn.findFirstOrThrow()).toMatchObject({
      source: "pain002",
      reasonCode: "AC04",
    });

    const again = jsonBody<CollectionReturnImportPreviewView>(
      await upload("preview", xml).expect(200),
    );
    expect(again.entries[0]?.status).toBe("already_returned");
  });

  it("camt.054 : un montant différent est signalé et ne se confirme pas", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { e2e } = await depositedLine(entityId);
    const xml = camt054(daysAgo(1).slice(0, 10), [
      { endToEndId: e2e, amount: "1.00", code: "AM04" },
    ]);

    const preview = jsonBody<CollectionReturnImportPreviewView>(
      await upload("preview", xml).expect(200),
    );
    expect(preview).toMatchObject({ format: "camt054", entries: [{ status: "amount_mismatch" }] });
    await upload("confirm", xml, [e2e]).expect(409);
    expect(await ctx.prisma.collectionReturn.count()).toBe(0);
  });
});

describe("le droit", () => {
  it("lecture seule : lit les retours, 403 sur la saisie, la résolution et l'import ; sans droit : 403", async () => {
    await readerStaff(ctx, "staff-lecture", "read");
    await readerStaff(ctx, "staff-sans-droit", null);
    const reader = ctx.asSub("staff-lecture");

    await reader.get(`${RETURNS}/batches/lot_x`).expect(200);
    await reader.get(`${RETURNS}/payers/co_x`).expect(200);
    await reader
      .post(`${RETURNS}/batches/lot_x/lines/1`)
      .send({
        kind: "reject",
        reasonCode: "AM04",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: null,
      })
      .expect(403);
    await reader.post(`${RETURNS}/ret_x/represent`).expect(403);
    await reader.post(`${RETURNS}/ret_x/write-off`).send({ note: "x" }).expect(403);
    await reader
      .post(`${RETURNS}/import/preview`)
      .attach("file", Buffer.from("<a/>"), "x.xml")
      .expect(403);
    await ctx.asSub("staff-sans-droit").get(`${RETURNS}/batches/lot_x`).expect(403);
  });
});
