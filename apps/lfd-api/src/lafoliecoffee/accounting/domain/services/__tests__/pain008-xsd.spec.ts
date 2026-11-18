import {
  CREATED_AT,
  DUE_DAY,
  OUR_COMPANY,
  FILE_ID,
  TEST_ID,
  generatedFile,
} from "../../entities/__tests__/collection-test-fixtures.js";
import { assembleCollection } from "../collection-assembly.js";
import { renderBatchFile } from "../collection-batch-file.js";
import { DEFAULT_TEST_REMITTANCE, renderTestFile } from "../collection-test-file.js";
import type { TestSequence } from "../pain008-document.js";
import { BATCH_ID, CREDITOR, ENTITY_ID, SEPTEMBER, mandate, order } from "./collection-fixtures.js";
import { pain008XsdErrors } from "./pain008-xsd.js";

/**
 * Le XSD officiel `pain.008.001.02` (ISO 20022, `test/fixtures/pain008/`)
 * sur les DEUX fichiers que le dépôt sait produire : celui d'un lot réel et
 * celui d'un prélèvement d'essai (plan `plan-prelevement-d-essai.md`, §4).
 */
function batchXml(): string {
  const { debits } = assembleCollection({
    legalEntityId: ENTITY_ID,
    at: new Date("2026-10-02T09:15:00.000Z"),
    payerPeriodStartsAt: () => SEPTEMBER.startsAt,
    statementMeansOf: () => "sepa_debit",
    orders: [order("c_port"), order("c_mer")],
    follows: [],
    mandates: [mandate("c_port"), mandate("c_mer", { paymentType: "one_off", bic: "BNPAFRPP" })],
    collectionForms: new Map(),
    consumedMandates: new Set(),
    companyNames: new Map([
      ["c_port", "Boulangerie du Port"],
      ["c_mer", "Café de la Mer"],
    ]),
    liveSchemes: [],
    invoices: new Map(),
    invoicingFloor: null,
  });
  return renderBatchFile({
    batchId: BATCH_ID,
    creditor: CREDITOR,
    scheme: "B2B",
    cycle: SEPTEMBER,
    constitutedAt: new Date("2026-10-02T09:15:00.000Z"),
    debits: debits.get("B2B") ?? [],
    unmandatedCompanies: [],
    requestedCollectionDay: "2026-10-16",
  }).xml;
}

describe("le XSD pain.008.001.02", () => {
  it("valide le fichier d'un lot réel (RCUR et OOFF)", async () => {
    const xml = batchXml();

    expect(xml).toContain("<SeqTp>RCUR</SeqTp>");
    expect(xml).toContain("<SeqTp>OOFF</SeqTp>");
    expect(await pain008XsdErrors(xml)).toEqual([]);
  });

  it.each(["RCUR", "FRST"] as const)("valide le fichier d'un essai en %s", async (sequence) => {
    expect(await pain008XsdErrors(generatedFile({ sequence }).toPersistence().xml)).toEqual([]);
  });

  it("valide un envoi à deux lignes et deux séquences (RCUR et FRST)", async () => {
    const xml = renderTestFile({
      fileId: FILE_ID,
      creditor: CREDITOR,
      scheme: "B2B",
      createdAt: CREATED_AT,
      requestedCollectionDay: DUE_DAY,
      remittance: DEFAULT_TEST_REMITTANCE,
      debits: [
        {
          endToEndId: `ESS-${TEST_ID}`,
          sequence: "RCUR",
          debtorName: "Folie Douce Val",
          amountCents: 100,
          mandate: mandate(OUR_COMPANY),
        },
        {
          endToEndId: "ESS-01JBQ7Z5K8M3QT9P2X4BE55B00",
          sequence: "FRST",
          debtorName: "Folie Douce Mer",
          amountCents: 42,
          mandate: mandate("c_mer"),
        },
      ],
    }).xml;

    expect(xml).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(await pain008XsdErrors(xml)).toEqual([]);
  });

  /**
   * Le rendu ACTUEL de `renderTestFile`, appelé en direct pour chaque séquence
   * qu'un essai admet — OOFF sur un mandat ponctuel (décision de Hugo du
   * 2026-10-26).
   */
  it.each([
    ["RCUR", "recurrent"],
    ["FRST", "recurrent"],
    ["OOFF", "one_off"],
  ] as const)("valide le rendu d'un essai en %s", async (sequence: TestSequence, paymentType) => {
    const { xml } = renderTestFile({
      fileId: FILE_ID,
      creditor: CREDITOR,
      scheme: "B2B",
      createdAt: CREATED_AT,
      requestedCollectionDay: DUE_DAY,
      remittance: DEFAULT_TEST_REMITTANCE,
      debits: [
        {
          endToEndId: `ESS-${TEST_ID}`,
          sequence,
          debtorName: "Folie Douce Val",
          amountCents: 100,
          mandate: mandate(OUR_COMPANY, { paymentType }),
        },
      ],
    });

    expect(xml).toContain(`<SeqTp>${sequence}</SeqTp>`);
    expect(await pain008XsdErrors(xml)).toEqual([]);
  });

  it("refuse un fichier dont la séquence n'existe pas (le validateur n'est pas creux)", async () => {
    const broken = generatedFile()
      .toPersistence()
      .xml.replace("<SeqTp>RCUR</SeqTp>", "<SeqTp>XXXX</SeqTp>");

    expect(await pain008XsdErrors(broken)).not.toEqual([]);
  });

  it("refuse une référence de plus de 35 caractères", async () => {
    const xml = generatedFile().toPersistence().xml;
    const long = xml.replace(/<MsgId>([^<]*)<\/MsgId>/u, "<MsgId>$1-TROP-LONG</MsgId>");

    expect(await pain008XsdErrors(long)).not.toEqual([]);
  });
});
