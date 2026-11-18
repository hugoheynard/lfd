import {
  CollectionTestFile,
  MAX_DEBTORS_PER_TEST_FILE,
  type TestFileLineInput,
} from "../collection-test-file.js";
import {
  CollectionTestFileDuplicateDebtorError,
  CollectionTestFileEmptyError,
  CollectionTestFileMixedCreditorsError,
  CollectionTestFileMixedSchemesError,
  CollectionTestFileTooManyDebtorsError,
} from "../../errors/collection-test-file-errors.js";
import {
  CollectionTestAmountOutOfRangeError,
  CollectionTestSequenceMismatchError,
} from "../../errors/collection-test-errors.js";
import { auditCsv, isAuditCoherent } from "../../services/pain008-audit.js";
import { CREDITOR } from "../../services/__tests__/collection-fixtures.js";
import { pain008XsdErrors } from "../../services/__tests__/pain008-xsd.js";
import {
  CREATED_AT,
  DUE_DAY,
  FILE_ID,
  OUR_COMPANY,
  eligibleFor,
  lineInput,
} from "./collection-test-fixtures.js";

/**
 * L'envoi d'essai à plusieurs débiteurs (plan
 * `plan-essai-a-plusieurs-debiteurs.md`) : un fichier, un `MsgId`, une ligne
 * par établissement. Instants DONNÉS, comparés à eux seuls.
 */
const SECOND_TEST_ID = "01JBQ7Z5K8M3QT9P2X4BE55B00";
const OTHER_COMPANY = "c_autre";

function second(overrides: Partial<TestFileLineInput> = {}): TestFileLineInput {
  return lineInput({
    testId: SECOND_TEST_ID,
    debtorCompanyId: OTHER_COMPANY,
    debtorName: "Folie Douce Mer",
    verdict: eligibleFor(OTHER_COMPANY),
    sequence: "FRST",
    amountCents: 42,
    ...overrides,
  });
}

function fileOf(lines: readonly TestFileLineInput[]): CollectionTestFile {
  return CollectionTestFile.generate({
    id: FILE_ID,
    created: { at: CREATED_AT, staffId: "staff_1" },
    creditor: CREDITOR,
    requestedCollectionDay: DUE_DAY,
    remittance: null,
    lines,
  });
}

/** `n` lignes sur `n` sociétés distinctes, chacune son ULID. */
function lines(n: number): readonly TestFileLineInput[] {
  return Array.from({ length: n }, (_, rank) => {
    const companyId = `c_${String(rank)}`;
    return lineInput({
      testId: `01JBQ7Z5K8M3QT9P2X4BE55C${String(rank).padStart(2, "0")}`,
      debtorCompanyId: companyId,
      debtorName: companyId,
      verdict: eligibleFor(companyId),
    });
  });
}

describe("un envoi d'essai à deux débiteurs", () => {
  it("un MsgId pour l'envoi, un EndToEndId par ligne, un PmtInf par séquence", () => {
    const file = fileOf([lineInput(), second()]);
    const { xml } = file.toPersistence();

    expect(file.tests.map((test) => test.toPersistence().messageId)).toEqual([
      `ESS-${FILE_ID}`,
      `ESS-${FILE_ID}`,
    ]);
    expect(file.tests.map((test) => test.fileId)).toEqual([FILE_ID, FILE_ID]);
    expect([...xml.matchAll(/<MsgId>([^<]*)</gu)].map((m) => m[1])).toEqual([`ESS-${FILE_ID}`]);
    expect([...xml.matchAll(/<PmtInfId>([^<]*)</gu)].map((m) => m[1])).toEqual([
      `ESS-${FILE_ID}-FRST`,
      `ESS-${FILE_ID}-RCUR`,
    ]);
    expect([...xml.matchAll(/<EndToEndId>([^<]*)</gu)].map((m) => m[1]).sort()).toEqual(
      file.tests.map((test) => test.endToEndId).sort(),
    );
  });

  it("l'en-tête compte les lignes et somme leurs montants", () => {
    const { xml } = fileOf([lineInput(), second()]).toPersistence();

    expect(xml.match(/<GrpHdr>[\s\S]*<\/GrpHdr>/u)?.[0]).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(xml.match(/<GrpHdr>[\s\S]*<\/GrpHdr>/u)?.[0]).toContain("<CtrlSum>1.42</CtrlSum>");
    expect(isAuditCoherent(xml)).toBe(true);
    expect(auditCsv(xml)).toContain(';"Lignes comptées";;;;"2"');
  });

  it("chaque ligne garde son montant, sa séquence et son débiteur", () => {
    const [a, b] = fileOf([lineInput(), second()]).tests.map((test) => test.toPersistence());

    expect(a).toMatchObject({ debtorCompanyId: OUR_COMPANY, amountCents: 100, sequence: "RCUR" });
    expect(b).toMatchObject({ debtorCompanyId: OTHER_COMPANY, amountCents: 42, sequence: "FRST" });
  });

  it("est valide au XSD pain.008.001.02, sur une et sur deux lignes", async () => {
    expect(await pain008XsdErrors(fileOf([lineInput()]).toPersistence().xml)).toEqual([]);
    expect(await pain008XsdErrors(fileOf([lineInput(), second()]).toPersistence().xml)).toEqual([]);
  });

  it(`admet ${String(MAX_DEBTORS_PER_TEST_FILE)} lignes, contrôle compris`, () => {
    const file = fileOf(lines(MAX_DEBTORS_PER_TEST_FILE));

    expect(file.tests).toHaveLength(MAX_DEBTORS_PER_TEST_FILE);
    expect(isAuditCoherent(file.toPersistence().xml)).toBe(true);
  });
});

describe("les refus d'un envoi", () => {
  it("le maximum est 10 lignes (Hugo, 2026-11-18)", () => {
    expect(MAX_DEBTORS_PER_TEST_FILE).toBe(10);
  });

  it("refuse un envoi vide", () => {
    expect(() => fileOf([])).toThrow(CollectionTestFileEmptyError);
  });

  it("refuse une onzième ligne", () => {
    expect(() => fileOf(lines(MAX_DEBTORS_PER_TEST_FILE + 1))).toThrow(
      CollectionTestFileTooManyDebtorsError,
    );
  });

  it("refuse deux fois le même établissement, en le nommant", () => {
    const twice = () => fileOf([lineInput(), lineInput({ testId: SECOND_TEST_ID })]);

    expect(twice).toThrow(CollectionTestFileDuplicateDebtorError);
    expect(twice).toThrow(/Folie Douce Val/u);
  });

  it("refuse un mandat signé chez une autre entité", () => {
    const elsewhere = second({ verdict: eligibleFor(OTHER_COMPANY, { creditorId: "le_2" }) });

    expect(() => fileOf([lineInput(), elsewhere])).toThrow(CollectionTestFileMixedCreditorsError);
  });

  it("refuse CORE et B2B dans le même fichier", () => {
    const core = second({ verdict: eligibleFor(OTHER_COMPANY, { scheme: "CORE" }) });

    expect(() => fileOf([lineInput(), core])).toThrow(CollectionTestFileMixedSchemesError);
  });

  it("le plafond de 1 € est PAR LIGNE : deux lignes à 1 € passent, une à 1,01 € refuse tout", () => {
    expect(fileOf([lineInput(), second({ amountCents: 100 })]).tests).toHaveLength(2);
    expect(() => fileOf([lineInput(), second({ amountCents: 101 })])).toThrow(
      CollectionTestAmountOutOfRangeError,
    );
  });

  it("une séquence refusée sur une ligne refuse l'envoi entier", () => {
    expect(() => fileOf([lineInput(), second({ sequence: "OOFF" })])).toThrow(
      CollectionTestSequenceMismatchError,
    );
  });
});
