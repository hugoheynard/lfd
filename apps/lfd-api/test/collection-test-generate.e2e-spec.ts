/**
 * E2E de l'outil de prélèvement d'essai — **la génération** : refus, fichier XSD, remboursement.
 *
 * Découpé de `collection-tests.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-test-scene.ts`.
 */
import type {
  CollectionTestCreatedView,
  CollectionTestDebtorsView,
  CollectionTestsView,
} from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { LOOKALIKE_WINDOW_DAYS } from "../src/b2b/accounting/domain/services/collection-test-lookalike.js";
import { TEST_COLLECTION_MIN_BUSINESS_DAYS } from "../src/b2b/accounting/domain/services/collection-test-file.js";
import { businessDaysAfter } from "../src/b2b/accounting/domain/services/target2-calendar.js";
import { pain008XsdErrors } from "../src/b2b/accounting/domain/services/__tests__/pain008-xsd.js";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import {
  batchCarrying,
  clock,
  ctx,
  DAY_MS,
  DEBTOR_IBAN,
  declare,
  entity,
  generate,
  moneyTables,
  ourCompany,
  proposedDay,
  SEPA_MAX,
  staff,
  TESTS,
  useCollectionTestScene,
} from "./collection-test-scene.js";

useCollectionTestScene();

describe("générer un prélèvement d'essai", () => {
  it("refuse une société non déclarée (409), en la nommant", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);

    const response = await generate(companyId, {
      requestedCollectionDay: daysAgo(-30).slice(0, 10),
    }).expect(409);

    expect(JSON.stringify(response.body)).toContain("Folie Douce Val");
    expect(await ctx.prisma.collectionTest.count()).toBe(0);
  });

  it("propose et accepte J + 2 jours ouvrés, refuse J + 1 en nommant la date minimale", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const today = instantToLocal(clock.now()).day;
    const earliest = businessDaysAfter(today, TEST_COLLECTION_MIN_BUSINESS_DAYS);

    expect(await proposedDay()).toBe(earliest);
    const refused = await generate(companyId, {
      requestedCollectionDay: businessDaysAfter(today, 1),
    }).expect(400);
    expect(JSON.stringify(refused.body)).toContain(earliest);
    await generate(companyId, { requestedCollectionDay: earliest }).expect(201);
  });

  it("refuse 1,01 € (400), et FNAL à la porte (400)", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();

    await generate(companyId, { requestedCollectionDay: day, amountCents: 101 }).expect(400);
    await generate(companyId, { requestedCollectionDay: day, sequence: "FNAL" }).expect(400);
    expect(await ctx.prisma.collectionTest.count()).toBe(0);
  });

  it("refuse le même montant qu'un essai récent du même mandat (409), admet un autre montant, puis le même passé quinze jours", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const first = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, { requestedCollectionDay: day, amountCents: 50 }).expect(201),
    );

    const refused = await generate(companyId, {
      requestedCollectionDay: day,
      amountCents: 50,
    }).expect(409);
    expect(JSON.stringify(refused.body)).toContain(`ESS-${first.testId}`);
    expect(JSON.stringify(refused.body)).toContain("Choisissez un autre montant");
    await generate(companyId, { requestedCollectionDay: day, amountCents: 49 }).expect(201);

    clock.set(new Date(clock.now().getTime() + (LOOKALIKE_WINDOW_DAYS + 1) * DAY_MS));
    const later = await proposedDay();
    await generate(companyId, { requestedCollectionDay: later, amountCents: 50 }).expect(201);
    expect(await ctx.prisma.collectionTest.count()).toBe(3);
  });

  it("refuse OOFF sur un mandat ponctuel qu'un lot réel porte (409)", async () => {
    const entityId = await entity();
    const { companyId, mandateId } = await ourCompany(entityId, "one_off");
    await declare(companyId);
    await batchCarrying(entityId, companyId, mandateId);

    const view = jsonBody<CollectionTestDebtorsView>(
      await staff().get(`${TESTS}/debtors`).expect(200),
    );
    expect(view.debtors[0]?.refusal).toContain("lot de prélèvement réel");
    await generate(companyId, {
      requestedCollectionDay: daysAgo(-30).slice(0, 10),
      sequence: "OOFF",
    }).expect(409);
  });

  it("garde un fichier valide au XSD, aux références ESS- ≤ 35, sans toucher l'argent réel", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const before = await moneyTables();

    const created = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, {
        requestedCollectionDay: day,
        sequence: "FRST",
        amountCents: 42,
      }).expect(201),
    );
    const file = await staff().get(`${TESTS}/${created.testId}/file.xml`).expect(200);
    const xml = file.text;

    expect(file.headers["content-disposition"]).toContain(
      `ESSAI-prelevement-ESS-${created.testId}.xml`,
    );
    expect(await pain008XsdErrors(xml)).toEqual([]);
    expect(xml).toContain("<SeqTp>FRST</SeqTp>");
    expect(xml).toContain(`<ReqdColltnDt>${day}</ReqdColltnDt>`);
    expect(xml).toContain(DEBTOR_IBAN);
    const ids = [...xml.matchAll(/<(MsgId|PmtInfId|EndToEndId)>([^<]*)</gu)].map(
      (match) => match[2] ?? "",
    );
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id.startsWith("ESS-")).toBe(true);
      expect(id.length).toBeLessThanOrEqual(SEPA_MAX);
    }
    const list = jsonBody<CollectionTestsView>(await staff().get(TESTS).expect(200));
    expect(list.tests).toEqual([
      expect.objectContaining({ id: created.testId, status: "awaiting_due_date", amountCents: 42 }),
    ]);
    expect(JSON.stringify(list)).not.toContain(DEBTOR_IBAN);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.test_generated" },
    });
    expect(JSON.stringify(fact.payload)).not.toContain(DEBTOR_IBAN);
    expect(await moneyTables()).toEqual(before);
  });

  it("« à rembourser » après l'échéance, puis « Marqué remboursé »", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const { testId } = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, { requestedCollectionDay: day }).expect(201),
    );
    await staff().post(`${TESTS}/${testId}/refunded`).send({ refundedOn: day }).expect(409);

    clock.set(new Date(new Date(`${day}T12:00:00.000Z`).getTime() + DAY_MS));
    expect(jsonBody<CollectionTestsView>(await staff().get(TESTS)).tests[0]?.status).toBe(
      "to_refund",
    );
    await staff().post(`${TESTS}/${testId}/refunded`).send({ refundedOn: day }).expect(204);

    expect(jsonBody<CollectionTestsView>(await staff().get(TESTS)).tests[0]).toMatchObject({
      status: "refunded",
      refundedOn: day,
      refundedByName: "Opérateur E2E",
    });
  });
});
