/**
 * E2E de l'outil de prélèvement d'essai — **le retour bancaire** d'un essai.
 * La scène commune vit dans `collection-test-scene.ts`.
 */
import type { CollectionReturnImportPreviewView, CollectionTestCreatedView } from "@lfd/contracts";
import { pain002 } from "../src/lafoliecoffee/accounting/domain/services/__tests__/bank-return-file-fixtures.js";
import { jsonBody } from "./e2e-harness.js";
import {
  declare,
  entity,
  generateFile,
  moneyTables,
  ourCompany,
  proposedDay,
  RETURNS,
  staff,
  testsOf,
  useCollectionTestScene,
} from "./collection-test-scene.js";

useCollectionTestScene();

describe("le retour bancaire d'un essai", () => {
  it("une référence ESS- se rattache à SA ligne de l'envoi, jamais à un lot ; l'autre ligne ne bouge pas", async () => {
    const entityId = await entity();
    const first = await ourCompany(entityId);
    const second = await ourCompany(entityId);
    await declare(first.companyId);
    await declare(second.companyId);
    const day = await proposedDay();
    const { fileId } = jsonBody<CollectionTestCreatedView>(
      await generateFile(
        [
          { companyId: first.companyId, amountCents: 100, sequence: "RCUR" },
          { companyId: second.companyId, amountCents: 42, sequence: "RCUR" },
        ],
        { requestedCollectionDay: day },
      ).expect(201),
    );
    const lines = await testsOf(fileId);
    const returned = lines.find((line) => line.debtorCompanyId === first.companyId);
    const untouched = lines.find((line) => line.debtorCompanyId === second.companyId);
    const reference = returned?.endToEndId ?? "";
    const xml = pain002(day, [{ endToEndId: reference, amount: "1.00", code: "AM04" }]);
    const before = await moneyTables();

    const preview = jsonBody<CollectionReturnImportPreviewView>(
      await staff()
        .post(`${RETURNS}/import/preview`)
        .attach("file", Buffer.from(xml), "retours.xml")
        .expect(200),
    );
    expect(preview.entries).toEqual([
      expect.objectContaining({
        endToEndId: reference,
        status: "collection_test",
        debtorName: "Folie Douce Val",
        batchLabel: `Essai ESS-${fileId}`,
      }),
    ]);
    await staff()
      .post(`${RETURNS}/import/confirm`)
      .attach("file", Buffer.from(xml), "retours.xml")
      .field("endToEndIds", JSON.stringify([reference]))
      .expect(201);

    const after = await testsOf(fileId);
    expect(after.find((line) => line.id === returned?.id)).toMatchObject({
      status: "returned",
      bankReturn: { kind: "reject", reasonCode: "AM04", amountCents: 100 },
    });
    expect(after.find((line) => line.id === untouched?.id)).toMatchObject({
      status: "awaiting_due_date",
      bankReturn: null,
    });
    expect(await moneyTables()).toEqual(before);
  });
});
