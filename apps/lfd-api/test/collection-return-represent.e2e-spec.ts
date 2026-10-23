/**
 * E2E des retours bancaires — **la saisie et la résolution** (R5a) : re-présenter,
 * perte, règlement autrement, refus.
 *
 * Découpé de `collection-returns.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-returns-scene.ts`.
 */
import type { BatchCollectionReturnsView, CollectionReturnView } from "@lfd/contracts";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import { invoicedPayer, setUpEntity } from "./collection-returns-scene.js";
import {
  clock,
  closesAt,
  COLLECTION,
  ctx,
  depositedLine,
  HOUR_MS,
  nextMonthConstitution,
  RETURNS,
  signal,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";

useCollectionReturnScene();

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
    await staff().get(`${COLLECTION}/batches/${line.batchId}/file.xml`).expect(200);
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
