import { BankExportOutdatedError } from "../../errors/mandate-bank-export-errors.js";
import type { MandateForBankExport } from "../../ports/mandates-for-bank-export.reader.js";
import { accountFingerprint } from "../account-fingerprint.js";
import { currentMandatesOf, selectForBankExport } from "../mandate-bank-export-selection.js";

const IBAN_A = "FR7630004000031234567890143";
const IBAN_B = "FR1420041010050500013M02606";

function mandate(id: string, iban = IBAN_A): MandateForBankExport {
  return {
    mandateId: id,
    reference: `RUM-${id}`,
    debtorCompanyId: `cmp_${id}`,
    iban,
    bic: "BNPAFRPP",
    signedAt: new Date("2026-09-01T10:00:00.000Z"),
    scheme: "B2B",
    paymentType: "recurrent",
  };
}

describe("l'empreinte d'un compte", () => {
  it("est un SHA-256 hexadécimal, insensible aux espaces et à la casse", () => {
    const fingerprint = accountFingerprint(IBAN_A);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(accountFingerprint("fr76 3000 4000 0312 3456 7890 143")).toBe(fingerprint);
  });

  it("ne contient pas l'IBAN, et diffère d'un compte à l'autre", () => {
    expect(accountFingerprint(IBAN_A)).not.toContain("30004");
    expect(accountFingerprint(IBAN_B)).not.toBe(accountFingerprint(IBAN_A));
  });
});

describe("« à exporter » se lit par l'empreinte (§ 2 bis-3)", () => {
  it("un mandat importé sous son compte actuel n'est plus à exporter", () => {
    const selection = selectForBankExport(
      [mandate("m1"), mandate("m2")],
      [{ mandateId: "m1", rum: "RUM-m1", accountFingerprint: accountFingerprint(IBAN_A) }],
    );
    expect(selection.toExport.map((e) => e.mandate.mandateId)).toEqual(["m2"]);
    expect(selection.alreadyImported.map((e) => e.mandate.mandateId)).toEqual(["m1"]);
  });

  it("un compte changé depuis l'import fait ressortir le mandat tout seul", () => {
    const selection = selectForBankExport(
      [mandate("m1", IBAN_B)],
      [{ mandateId: "m1", rum: "RUM-m1", accountFingerprint: accountFingerprint(IBAN_A) }],
    );
    expect(selection.toExport.map((e) => e.mandate.mandateId)).toEqual(["m1"]);
  });

  it("l'empreinte d'un AUTRE mandat ne compte pas", () => {
    const selection = selectForBankExport(
      [mandate("m1")],
      [{ mandateId: "m2", rum: "RUM-m2", accountFingerprint: accountFingerprint(IBAN_A) }],
    );
    expect(selection.toExport).toHaveLength(1);
  });
});

describe("le fichier d'un export, relu aujourd'hui", () => {
  const line = { mandateId: "m1", rum: "RUM-m1", accountFingerprint: accountFingerprint(IBAN_A) };

  it("rend les mandats de l'export, dans son ordre", () => {
    const second = { ...line, mandateId: "m2", rum: "RUM-m2" };
    const current = currentMandatesOf(
      [second, line],
      [mandate("m1"), mandate("m2"), mandate("m3")],
    );
    expect(current.map((m) => m.mandateId)).toEqual(["m2", "m1"]);
  });

  it("refuse en nommant la RUM d'un compte qui ne correspond plus", () => {
    expect(() => currentMandatesOf([line], [mandate("m1", IBAN_B)])).toThrow(
      BankExportOutdatedError,
    );
    expect(() => currentMandatesOf([line], [mandate("m1", IBAN_B)])).toThrow(/RUM-m1/u);
  });

  it("refuse un mandat qui n'est plus exportable (révoqué, écarté)", () => {
    expect(() => currentMandatesOf([line], [])).toThrow(BankExportOutdatedError);
  });
});
