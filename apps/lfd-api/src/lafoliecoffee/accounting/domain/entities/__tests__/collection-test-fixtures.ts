import { CREDITOR, mandate } from "../../services/__tests__/collection-fixtures.js";
import { judgeTestDebtor, type TestDebtorVerdict } from "../../services/collection-test-debtor.js";
import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";
import type { CollectionTest } from "../collection-test.js";
import {
  CollectionTestFile,
  type GenerateCollectionTestFileInput,
  type TestFileLineInput,
} from "../collection-test-file.js";

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
/** L'envoi qui porte `TEST_ID` — toujours son propre ULID. */
export const FILE_ID = "01JBQ7Z5K8M3QT9P2X4BE55F00";
export const CREATED_AT = new Date("2026-10-22T08:00:00.000Z");
export const EARLIEST_DAY = "2026-10-26";
export const DUE_DAY = "2026-11-05";
export const OUR_COMPANY = "c_nous";

export function eligible(
  overrides: Partial<CollectionMandate> = {},
): Extract<TestDebtorVerdict, { kind: "eligible" }> {
  return eligibleFor(OUR_COMPANY, overrides);
}

/** Le verdict d'une société à nous, active, au mandat récurrent chez `le_1`. */
export function eligibleFor(
  companyId: string,
  overrides: Partial<CollectionMandate> = {},
): Extract<TestDebtorVerdict, { kind: "eligible" }> {
  const verdict = judgeTestDebtor({
    companyName: companyId,
    companyStatus: "active",
    declared: true,
    mandates: [mandate(companyId, overrides)],
    batchedMandateIds: new Set(),
  });
  if (verdict.kind !== "eligible") {
    throw verdict.refusal;
  }
  return verdict;
}

/** Une ligne d'envoi sur `OUR_COMPANY`. */
export function lineInput(overrides: Partial<TestFileLineInput> = {}): TestFileLineInput {
  return {
    testId: TEST_ID,
    debtorCompanyId: OUR_COMPANY,
    debtorName: "Folie Douce Val",
    verdict: eligible(),
    sequence: "RCUR",
    amountCents: 100,
    recentOnMandate: [],
    ...overrides,
  };
}

/** Ce qu'un envoi d'UNE ligne reçoit, à plat : l'envoi et sa ligne. */
export type OneLineInput = Omit<GenerateCollectionTestFileInput, "lines"> &
  Omit<TestFileLineInput, "testId">;

export function generateInput(overrides: Partial<OneLineInput> = {}): OneLineInput {
  const { testId: _testId, ...line } = lineInput();
  return {
    id: FILE_ID,
    created: { at: CREATED_AT, staffId: "staff_1" },
    creditor: CREDITOR,
    requestedCollectionDay: DUE_DAY,
    remittance: null,
    ...line,
    ...overrides,
  };
}

/** Un envoi d'une ligne (`TEST_ID`). */
export function generatedFile(overrides: Partial<OneLineInput> = {}): CollectionTestFile {
  const input = generateInput(overrides);
  return CollectionTestFile.generate({
    id: input.id,
    created: input.created,
    creditor: input.creditor,
    requestedCollectionDay: input.requestedCollectionDay,
    remittance: input.remittance,
    lines: [
      lineInput({
        debtorCompanyId: input.debtorCompanyId,
        debtorName: input.debtorName,
        verdict: input.verdict,
        sequence: input.sequence,
        amountCents: input.amountCents,
        recentOnMandate: input.recentOnMandate,
      }),
    ],
  });
}

/** La ligne d'un envoi d'une ligne. */
export function generated(overrides: Partial<OneLineInput> = {}): CollectionTest {
  const [test] = generatedFile(overrides).tests;
  if (test === undefined) {
    throw new Error("un envoi d'une ligne rend une ligne");
  }
  return test;
}
