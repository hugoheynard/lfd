import { generated } from "../../entities/__tests__/collection-test-fixtures.js";
import { assembleCollection } from "../collection-assembly.js";
import { renderBatchFile } from "../collection-batch-file.js";
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
  it("valide le fichier d'un lot réel (RCUR et OOFF)", () => {
    const xml = batchXml();

    expect(xml).toContain("<SeqTp>RCUR</SeqTp>");
    expect(xml).toContain("<SeqTp>OOFF</SeqTp>");
    expect(pain008XsdErrors(xml)).toEqual([]);
  });

  it.each(["RCUR", "FRST"] as const)("valide le fichier d'un essai en %s", (sequence) => {
    expect(pain008XsdErrors(generated({ sequence }).toPersistence().xml)).toEqual([]);
  });

  it("refuse un fichier dont la séquence n'existe pas (le validateur n'est pas creux)", () => {
    const broken = generated()
      .toPersistence()
      .xml.replace("<SeqTp>RCUR</SeqTp>", "<SeqTp>XXXX</SeqTp>");

    expect(pain008XsdErrors(broken)).not.toEqual([]);
  });

  it("refuse une référence de plus de 35 caractères", () => {
    const xml = generated().toPersistence().xml;
    const long = xml.replace(/<MsgId>([^<]*)<\/MsgId>/u, "<MsgId>$1-TROP-LONG</MsgId>");

    expect(pain008XsdErrors(long)).not.toEqual([]);
  });
});
