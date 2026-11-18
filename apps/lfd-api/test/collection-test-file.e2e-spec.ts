/**
 * E2E de l'outil de prélèvement d'essai — **l'envoi à plusieurs débiteurs** :
 * un fichier, un `MsgId`, une ligne par établissement (plan
 * `documentation/comptabilite/prelevement/plan-essai-a-plusieurs-debiteurs.md`).
 * La scène commune vit dans `collection-test-scene.ts`.
 */
import type { CollectionTestCreatedView } from "@lfd/contracts";
import { sha256Of } from "../src/lafoliecoffee/accounting/domain/services/collection-batch-file.js";
import { pain008XsdErrors } from "../src/lafoliecoffee/accounting/domain/services/__tests__/pain008-xsd.js";
import { E2E_STAFF_ID, jsonBody } from "./e2e-harness.js";
import {
  ctx,
  declare,
  entity,
  generateFile,
  moneyTables,
  ourCompany,
  proposedDay,
  staff,
  TESTS,
  testsOf,
  useCollectionTestScene,
} from "./collection-test-scene.js";

useCollectionTestScene();

async function twoDeclared(): Promise<readonly [string, string]> {
  const entityId = await entity();
  const first = await ourCompany(entityId);
  const second = await ourCompany(entityId);
  await declare(first.companyId);
  await declare(second.companyId);
  return [first.companyId, second.companyId];
}

describe("un envoi d'essai à deux établissements", () => {
  it("un fichier valide au XSD, deux lignes, le même fichier par l'envoi et par chaque ligne", async () => {
    const [a, b] = await twoDeclared();
    const day = await proposedDay();
    const before = await moneyTables();

    const { fileId } = jsonBody<CollectionTestCreatedView>(
      await generateFile(
        [
          { companyId: a, amountCents: 100, sequence: "RCUR" },
          { companyId: b, amountCents: 42, sequence: "FRST" },
        ],
        { requestedCollectionDay: day },
      ).expect(201),
    );

    const file = await staff().get(`${TESTS}/files/${fileId}/file.xml`).expect(200);
    expect(file.headers["content-disposition"]).toContain(`ESSAI-prelevement-ESS-${fileId}.xml`);
    expect(await pain008XsdErrors(file.text)).toEqual([]);
    expect(file.text).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(file.text).toContain("<CtrlSum>1.42</CtrlSum>");
    expect([...file.text.matchAll(/<MsgId>([^<]*)</gu)].map((m) => m[1])).toEqual([
      `ESS-${fileId}`,
    ]);
    const lines = await testsOf(fileId);
    expect(lines.map((line) => [line.debtorCompanyId, line.amountCents]).sort()).toEqual(
      [
        [a, 100],
        [b, 42],
      ].sort(),
    );
    for (const line of lines) {
      expect(line.messageId).toBe(`ESS-${fileId}`);
      expect(file.text).toContain(`<EndToEndId>${line.endToEndId}</EndToEndId>`);
      const byLine = await staff().get(`${TESTS}/${line.id}/file.xml`).expect(200);
      expect(byLine.text).toBe(file.text);
    }
    expect(await ctx.prisma.collectionTest.count({ where: { xml: { not: null } } })).toBe(0);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "collection.test_generated" } }),
    ).toBe(2);
    expect(await moneyTables()).toEqual(before);
  });

  it("refuse le même établissement deux fois (400) et n'écrit rien", async () => {
    const [a] = await twoDeclared();
    const day = await proposedDay();

    await generateFile(
      [
        { companyId: a, amountCents: 100, sequence: "RCUR" },
        { companyId: a, amountCents: 99, sequence: "RCUR" },
      ],
      { requestedCollectionDay: day },
    ).expect(400);
    expect(await ctx.prisma.collectionTestFile.count()).toBe(0);
  });

  it("un refus sur une ligne (1,01 €) n'écrit ni envoi ni essai", async () => {
    const [a, b] = await twoDeclared();
    const day = await proposedDay();

    await generateFile(
      [
        { companyId: a, amountCents: 100, sequence: "RCUR" },
        { companyId: b, amountCents: 101, sequence: "RCUR" },
      ],
      { requestedCollectionDay: day },
    ).expect(400);
    expect(await ctx.prisma.collectionTestFile.count()).toBe(0);
    expect(await ctx.prisma.collectionTest.count()).toBe(0);
  });

  it("refuse un envoi sans débiteur à la porte (400)", async () => {
    await twoDeclared();
    const day = await proposedDay();

    await generateFile([], { requestedCollectionDay: day }).expect(400);
  });

  it("404 sur un envoi inconnu", async () => {
    await staff().get(`${TESTS}/files/01JBQ7Z5K8M3QT9P2X4BE55F00/file.xml`).expect(404);
  });
});

describe("un essai repris d'avant l'envoi", () => {
  /**
   * La reprise de la migration fait de chaque essai un envoi d'une ligne, de
   * MÊME id, au fichier recopié. Écrit ici par Prisma sous cette forme : le
   * fichier se télécharge à l'identique, par l'essai comme par l'envoi.
   */
  it("se télécharge à l'identique, même empreinte", async () => {
    const entityId = await entity();
    const { companyId, mandateId } = await ourCompany(entityId);
    const id = "01JBQ7Z5K8M3QT9P2X4BE55A00";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Document>essai d'avant</Document>\n`;
    const now = new Date();
    await ctx.prisma.collectionTestFile.create({
      data: {
        id,
        legalEntityId: entityId,
        scheme: "B2B",
        requestedCollectionDay: now,
        messageId: `ESS-${id}`,
        xml,
        fileSha256: sha256Of(xml),
        createdAt: now,
        createdByStaffId: E2E_STAFF_ID,
        tests: {
          create: {
            id,
            legalEntityId: entityId,
            debtorCompanyId: companyId,
            debtorName: "Folie Douce Val",
            mandateId,
            mandateReference: "RUM-ESS-AVANT",
            scheme: "B2B",
            sequence: "RCUR",
            amountCents: 100,
            requestedCollectionDay: now,
            remittance: "ESSAI PRELEVEMENT",
            messageId: `ESS-${id}`,
            endToEndId: `ESS-${id}`,
            fileSha256: sha256Of(xml),
            createdAt: now,
            createdByStaffId: E2E_STAFF_ID,
          },
        },
      },
    });

    const byTest = await staff().get(`${TESTS}/${id}/file.xml`).expect(200);
    const byFile = await staff().get(`${TESTS}/files/${id}/file.xml`).expect(200);

    expect(sha256Of(byTest.text)).toBe(sha256Of(xml));
    expect(byFile.text).toBe(byTest.text);
    expect(byTest.headers["content-disposition"]).toContain(`ESSAI-prelevement-ESS-${id}.xml`);
  });
});
