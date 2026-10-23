import {
  BankExportNotDepositedError,
  BankLineAlreadyCorrectedError,
  BankLineNotInExportError,
  BankRejectionReasonError,
  BankReportWindowClosedError,
} from "../../errors/bank-report-errors.js";
import { MandateBankExportAbandonedError } from "../../errors/mandate-bank-export-errors.js";
import { AccountBankExport } from "../account-bank-export.js";
import { BANK_REPORT_WINDOW_DAYS, isCorrectable } from "../bank-line-correction.js";
import { MandateBankExport } from "../mandate-bank-export.js";

// Les dates ne sont comparées qu'entre elles : aucune horloge réelle n'est lue.
const CREATED = { at: new Date("2026-10-09T09:00:00.000Z"), staffId: "staff_1" };
const DEPOSITED = { at: new Date("2026-10-10T09:00:00.000Z"), staffId: "staff_2" };
const NEXT_DAY = { at: new Date("2026-10-11T09:00:00.000Z"), staffId: "staff_3" };
const DAY_MS = 86_400_000;
const FP = "a".repeat(64);

function accounts(): AccountBankExport {
  return AccountBankExport.export({
    id: "abe_1",
    legalEntityId: "le1",
    created: CREATED,
    lines: [
      { bankAccountId: "rib_a", companyId: "cmp_a", accountFingerprint: FP },
      { bankAccountId: "rib_b", companyId: "cmp_b", accountFingerprint: "b".repeat(64) },
    ],
  });
}

function deposited(): AccountBankExport {
  const bankExport = accounts();
  bankExport.recordDownload(CREATED.at);
  bankExport.markImported(DEPOSITED);
  return bankExport;
}

function mandates(): MandateBankExport {
  return MandateBankExport.export({
    id: "mbe_1",
    legalEntityId: "le1",
    created: CREATED,
    lines: [{ mandateId: "m1", rum: "RUM-1", accountFingerprint: FP }],
  });
}

describe("le compte rendu CENET sur un compte d'un export (Hugo, 2026-10-23)", () => {
  it("avant le dépôt, aucun geste : téléchargé ou non", () => {
    const bankExport = accounts();
    expect(() => bankExport.reportKnownByBank("rib_a", NEXT_DAY)).toThrow(
      BankExportNotDepositedError,
    );
    bankExport.recordDownload(CREATED.at);
    expect(() => bankExport.rejectAccount("rib_a", NEXT_DAY, "IBAN inconnu")).toThrow(
      /Disponible après le dépôt dans CENET/u,
    );
  });

  it("après le dépôt, « signalé connu » se pose sur la seule ligne nommée", () => {
    const bankExport = deposited();
    const line = bankExport.reportKnownByBank("rib_a", NEXT_DAY);
    expect(line.correction).toEqual({
      kind: "reported_by_bank",
      stamp: NEXT_DAY,
      rejectionReason: null,
    });
    const lines = bankExport.toPersistence().lines;
    expect(lines.map((row) => row.correction?.kind ?? null)).toEqual(["reported_by_bank", null]);
  });

  it("« rejeté » garde le motif, rogné, et l'exige", () => {
    const bankExport = deposited();
    expect(() => bankExport.rejectAccount("rib_a", NEXT_DAY, "   ")).toThrow(
      BankRejectionReasonError,
    );
    expect(() => bankExport.rejectAccount("rib_a", NEXT_DAY, "x".repeat(201))).toThrow(
      BankRejectionReasonError,
    );
    const line = bankExport.rejectAccount("rib_a", NEXT_DAY, "  BIC invalide ");
    expect(line.correction).toMatchObject({ kind: "rejected", rejectionReason: "BIC invalide" });
  });

  it("une ligne ne se corrige qu'une fois : la première fait foi", () => {
    const bankExport = deposited();
    bankExport.reportKnownByBank("rib_a", NEXT_DAY);
    expect(() => bankExport.rejectAccount("rib_a", NEXT_DAY, "erreur")).toThrow(
      BankLineAlreadyCorrectedError,
    );
    expect(bankExport.toPersistence().lines[0]?.correction?.kind).toBe("reported_by_bank");
  });

  it(`se ferme ${String(BANK_REPORT_WINDOW_DAYS)} jours après le dépôt`, () => {
    const last = new Date(DEPOSITED.at.getTime() + BANK_REPORT_WINDOW_DAYS * DAY_MS);
    const after = new Date(last.getTime() + 1);
    expect(() => deposited().reportKnownByBank("rib_a", { at: last, staffId: "s" })).not.toThrow();
    expect(() => deposited().reportKnownByBank("rib_a", { at: after, staffId: "s" })).toThrow(
      BankReportWindowClosedError,
    );
    expect(isCorrectable(DEPOSITED.at, null, last)).toBe(true);
    expect(isCorrectable(DEPOSITED.at, null, after)).toBe(false);
    expect(isCorrectable(DEPOSITED.at, "rejected", last)).toBe(false);
    expect(isCorrectable(null, null, last)).toBe(false);
  });

  it("un compte absent de l'export est un 404", () => {
    expect(() => deposited().reportKnownByBank("rib_x", NEXT_DAY)).toThrow(
      BankLineNotInExportError,
    );
  });
});

describe("le compte rendu CENET sur un mandat d'un export (Hugo, 2026-10-23)", () => {
  it("avant le dépôt, refusé ; après, « rejeté » puis plus rien", () => {
    const bankExport = mandates();
    bankExport.recordDownload(CREATED.at);
    expect(() => bankExport.reportKnownByBank("m1", NEXT_DAY)).toThrow(BankExportNotDepositedError);
    bankExport.markImported(DEPOSITED);
    bankExport.rejectMandate("m1", NEXT_DAY, "RUM déjà présente");
    expect(bankExport.toPersistence().lines[0]?.correction).toMatchObject({
      kind: "rejected",
      rejectionReason: "RUM déjà présente",
    });
    expect(() => bankExport.reportKnownByBank("m1", NEXT_DAY)).toThrow(
      BankLineAlreadyCorrectedError,
    );
  });

  it("un export abandonné ne se corrige pas", () => {
    const bankExport = mandates();
    bankExport.abandon(DEPOSITED);
    expect(() => bankExport.reportKnownByBank("m1", NEXT_DAY)).toThrow(
      MandateBankExportAbandonedError,
    );
  });
});
