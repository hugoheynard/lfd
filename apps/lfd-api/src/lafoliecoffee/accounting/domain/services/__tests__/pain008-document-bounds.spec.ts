import { SepaIdentifierTooLongError } from "../../errors/collection-errors.js";
import {
  type DocumentDebit,
  type Pain008Document,
  renderPain008Document,
} from "../pain008-document.js";
import { SEPA_NAME_MAX } from "../sepa-text.js";
import { CREDITOR } from "./collection-fixtures.js";
import { pain008XsdErrors } from "./pain008-xsd.js";

const LONG_NAME = `Societe ${"Boulangerie Patisserie Alpine ".repeat(4)}`.slice(0, 120);

function debit(overrides: Partial<DocumentDebit> = {}): DocumentDebit {
  return {
    sequence: "RCUR",
    endToEndId: "01JBQ00000000000000000000A-0001",
    debtorName: "Boulangerie du Port",
    amountCents: 12_345,
    remittance: "Commandes de septembre",
    mandate: {
      reference: "LFC-PORT-260901-ABCD",
      iban: "FR7630006000011234567890189",
      bic: null,
      signedAt: new Date("2026-09-01T10:00:00.000Z"),
      paymentType: "recurrent",
    },
    ...overrides,
  };
}

function render(debits: readonly DocumentDebit[], creditorName = CREDITOR.name): string {
  const document: Pain008Document = {
    creditor: { ...CREDITOR, name: creditorName },
    scheme: "B2B",
    messageId: "01JBQ00000000000000000000A",
    paymentInfoIdOf: (sequence) => `01JBQ00000000000000000000A-${sequence}`,
    emptySequence: "RCUR",
    createdAt: new Date("2026-10-02T09:15:00.000Z"),
    requestedCollectionDay: "2026-10-16",
    banner: null,
    debits,
  };
  return renderPain008Document(document);
}

function names(xml: string): readonly string[] {
  return [...xml.matchAll(/<Nm>([^<]*)<\/Nm>/gu)].map((match) => match[1] ?? "");
}

describe("les bornes du pain.008", () => {
  /** Régression : `Dbtr/Nm` s'écrivait sans borne, la banque applique 70 (EPC). */
  it("un nom de débiteur de plus de 70 caractères faisait rejeter la remise", () => {
    const xml = render([debit({ debtorName: LONG_NAME })]);

    expect(LONG_NAME).toHaveLength(120);
    expect(xml).toContain(`<Dbtr><Nm>${LONG_NAME.slice(0, SEPA_NAME_MAX).trimEnd()}</Nm></Dbtr>`);
  });

  it("coupe aussi le nom du créancier, dans InitgPty et Cdtr", () => {
    const xml = render([debit()], LONG_NAME);

    expect(names(xml).every((name) => name.length <= SEPA_NAME_MAX)).toBe(true);
  });

  it("valide le XSD avec un nom de 120 caractères, tous les Nm sous 70", async () => {
    const xml = render([debit({ debtorName: LONG_NAME })], LONG_NAME);

    expect(await pain008XsdErrors(xml)).toEqual([]);
    expect(names(xml).every((name) => name.length <= SEPA_NAME_MAX)).toBe(true);
  });

  it("refuse une RUM de plus de 35 caractères, en nommant le débiteur — jamais coupée", () => {
    const tooLong = debit({ mandate: { ...debit().mandate, reference: "R".repeat(36) } });

    expect(() => render([tooLong])).toThrow(SepaIdentifierTooLongError);
    expect(() => render([tooLong])).toThrow(/MndtId .*Boulangerie du Port/u);
  });

  it("refuse un EndToEndId de plus de 35 caractères", () => {
    expect(() => render([debit({ endToEndId: "E".repeat(36) })])).toThrow(/EndToEndId/u);
  });
});
