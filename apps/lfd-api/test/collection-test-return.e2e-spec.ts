/**
 * E2E de l'outil de prélèvement d'essai — **le retour bancaire** d'un essai.
 *
 * Découpé de `collection-tests.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-test-scene.ts`.
 */
import type {
  CollectionReturnImportPreviewView,
  CollectionTestCreatedView,
  CollectionTestsView,
} from "@lfd/contracts";
import { pain002 } from "../src/b2b/accounting/domain/services/__tests__/bank-return-file-fixtures.js";
import { jsonBody } from "./e2e-harness.js";
import {
  declare,
  entity,
  generate,
  moneyTables,
  ourCompany,
  proposedDay,
  RETURNS,
  staff,
  TESTS,
  useCollectionTestScene,
} from "./collection-test-scene.js";

useCollectionTestScene();

describe("le retour bancaire d'un essai", () => {
  it("une référence ESS- se rattache à son essai, jamais à un lot", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const { testId } = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, { requestedCollectionDay: day }).expect(201),
    );
    const reference = `ESS-${testId}`;
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
      }),
    ]);
    await staff()
      .post(`${RETURNS}/import/confirm`)
      .attach("file", Buffer.from(xml), "retours.xml")
      .field("endToEndIds", JSON.stringify([reference]))
      .expect(201);

    const list = jsonBody<CollectionTestsView>(await staff().get(TESTS).expect(200));
    expect(list.tests[0]).toMatchObject({
      status: "returned",
      bankReturn: { kind: "reject", reasonCode: "AM04", amountCents: 100 },
    });
    expect(await moneyTables()).toEqual(before);
  });
});
