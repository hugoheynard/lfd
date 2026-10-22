import { CREDITOR, mandate } from "../../services/__tests__/collection-fixtures.js";
import { judgeTestDebtor, type TestDebtorVerdict } from "../../services/collection-test-debtor.js";
import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";
import { CollectionTest, type GenerateCollectionTestInput } from "../collection-test.js";

/**
 * Données des tests du prélèvement d'essai. L'instant de génération est
 * DONNÉ (il joue l'horloge) : l'échéance n'est comparée qu'à lui, jamais à
 * l'horloge réelle — les dates peuvent rester absolues.
 *
 * Jeudi 22 octobre 2026, 10 h à Paris → échéance la plus proche : J + 2
 * jours ouvrés TARGET2, lundi 26 octobre 2026. Les essais des fixtures
 * tombent plus loin, le jeudi 5 novembre (`DUE_DAY`).
 */
export const TEST_ID = "01JBQ7Z5K8M3QT9P2X4BE55A00";
export const CREATED_AT = new Date("2026-10-22T08:00:00.000Z");
export const EARLIEST_DAY = "2026-10-26";
export const DUE_DAY = "2026-11-05";
export const OUR_COMPANY = "c_nous";

export function eligible(
  overrides: Partial<CollectionMandate> = {},
): Extract<TestDebtorVerdict, { kind: "eligible" }> {
  const verdict = judgeTestDebtor({
    companyName: "Folie Douce Val",
    companyStatus: "active",
    declared: true,
    mandates: [mandate(OUR_COMPANY, overrides)],
    batchedMandateIds: new Set(),
  });
  if (verdict.kind !== "eligible") {
    throw verdict.refusal;
  }
  return verdict;
}

export function generateInput(
  overrides: Partial<GenerateCollectionTestInput> = {},
): GenerateCollectionTestInput {
  return {
    id: TEST_ID,
    created: { at: CREATED_AT, staffId: "staff_1" },
    creditor: CREDITOR,
    debtorCompanyId: OUR_COMPANY,
    debtorName: "Folie Douce Val",
    verdict: eligible(),
    sequence: "RCUR",
    amountCents: 100,
    requestedCollectionDay: DUE_DAY,
    remittance: null,
    ...overrides,
  };
}

export function generated(overrides: Partial<GenerateCollectionTestInput> = {}): CollectionTest {
  return CollectionTest.generate(generateInput(overrides));
}
