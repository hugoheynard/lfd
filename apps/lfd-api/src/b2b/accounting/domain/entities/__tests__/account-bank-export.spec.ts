import { AccountBankExport, type ExportAccountsInput } from "../account-bank-export.js";
import {
  KNOWN_BANK_ACCOUNT_REASONS,
  KnownBankAccount,
  knownBankAccountReason,
} from "../known-bank-account.js";
import {
  AccountAlreadyKnownToBankError,
  AccountBankExportClosedError,
  AccountBankExportNeverDownloadedError,
  AccountBankExportTooLargeError,
  DuplicateAccountInBankExportError,
  NoAccountToExportError,
  UnknownKnownAccountReasonError,
} from "../../errors/account-bank-export-errors.js";
import { accountFingerprint } from "../../services/account-fingerprint.js";
import { ACCOUNT_IMPORT_MAX_ROWS } from "../../services/account-bank-export-values.js";

/** Comparé à rien d'autre qu'aux tampons qu'il pose. */
const AT = new Date("2026-10-23T09:00:00.000Z");
const FP_A = accountFingerprint("FR7630004000031234567890143");
const FP_B = accountFingerprint("FR1420041010050500013M02606");

function input(fingerprints: readonly string[]): ExportAccountsInput {
  return {
    id: "exp_1",
    legalEntityId: "le1",
    created: { at: AT, staffId: "staff_1" },
    lines: fingerprints.map((fingerprint, index) => ({
      bankAccountId: `rib_${String(index)}`,
      companyId: `cmp_${String(index)}`,
      accountFingerprint: fingerprint,
    })),
  };
}

describe("un export des comptes (§ 2.3)", () => {
  it("porte au moins un compte", () => {
    expect(() => AccountBankExport.export(input([]))).toThrow(NoAccountToExportError);
  });

  it("porte 200 comptes au plus", () => {
    const many = Array.from({ length: ACCOUNT_IMPORT_MAX_ROWS + 1 }, (_, index) =>
      accountFingerprint(`FR76${String(index).padStart(23, "0")}`),
    );
    expect(() => AccountBankExport.export(input(many))).toThrow(AccountBankExportTooLargeError);
  });

  it("refuse un même compte deux fois — la banque rejetterait tout", () => {
    expect(() => AccountBankExport.export(input([FP_A, FP_A]))).toThrow(
      DuplicateAccountInBankExportError,
    );
  });

  it("naît en vol : ni importé, ni abandonné", () => {
    const state = AccountBankExport.export(input([FP_A, FP_B])).toPersistence();
    expect(state.imported).toBeNull();
    expect(state.abandoned).toBeNull();
    expect(state.lines).toHaveLength(2);
  });

  it("se marque importé une fois, puis ne s'abandonne plus", () => {
    const bankExport = AccountBankExport.export(input([FP_A]));
    bankExport.recordDownload(AT);
    bankExport.markImported({ at: AT, staffId: "staff_2" });
    expect(bankExport.toPersistence().imported).toEqual({ at: AT, staffId: "staff_2" });
    expect(() => bankExport.markImported({ at: AT, staffId: "staff_3" })).toThrow(
      AccountBankExportClosedError,
    );
    expect(() => bankExport.abandon({ at: AT, staffId: "staff_3" })).toThrow(
      AccountBankExportClosedError,
    );
    expect(() => bankExport.assertDownloadable()).not.toThrow();
  });

  it("ne se marque pas importé tant que son fichier n'a pas été téléchargé", () => {
    const bankExport = AccountBankExport.export(input([FP_A]));
    expect(bankExport.toPersistence().lastDownloadedAt).toBeNull();
    expect(() => bankExport.markImported({ at: AT, staffId: "staff_2" })).toThrow(
      AccountBankExportNeverDownloadedError,
    );
    bankExport.recordDownload(AT);
    expect(bankExport.toPersistence().lastDownloadedAt).toEqual(AT);
    expect(() => bankExport.markImported({ at: AT, staffId: "staff_2" })).not.toThrow();
  });

  it("s'abandonne une fois, puis ne se marque plus importé ni ne se télécharge", () => {
    const bankExport = AccountBankExport.export(input([FP_A]));
    bankExport.abandon({ at: AT, staffId: "staff_2" });
    expect(() => bankExport.markImported({ at: AT, staffId: "staff_3" })).toThrow(
      AccountBankExportClosedError,
    );
    expect(() => bankExport.abandon({ at: AT, staffId: "staff_3" })).toThrow(
      AccountBankExportClosedError,
    );
    expect(() => bankExport.assertDownloadable()).toThrow(AccountBankExportClosedError);
  });
});

describe("« connu de la banque » (§ 2.6)", () => {
  const declaration = {
    reason: KNOWN_BANK_ACCOUNT_REASONS.enteredInCenet,
    id: "kba_1",
    legalEntityId: "le1",
    bankAccountId: "rib_a",
    companyId: "cmp_a",
    companyName: "Café A",
    accountFingerprint: FP_A,
    declared: { at: AT, staffId: "staff_1" },
  };

  it("pose l'empreinte, sans le nom de la société", () => {
    const state = KnownBankAccount.declare(declaration, {
      known: new Set(),
      inFlight: new Set(),
    }).toPersistence();
    expect(state).toEqual({
      id: "kba_1",
      legalEntityId: "le1",
      bankAccountId: "rib_a",
      companyId: "cmp_a",
      accountFingerprint: FP_A,
      declared: { at: AT, staffId: "staff_1" },
      reason: "entered_in_cenet",
    });
  });

  it("refuse une raison qui n'est aucun des deux gestes", () => {
    expect(() => knownBankAccountReason("already_known")).toThrow(UnknownKnownAccountReasonError);
    expect(knownBankAccountReason("reported_by_bank")).toBe("reported_by_bank");
  });

  it("porte la raison « signalé par la banque »", () => {
    const state = KnownBankAccount.declare(
      { ...declaration, reason: KNOWN_BANK_ACCOUNT_REASONS.reportedByBank },
      { known: new Set(), inFlight: new Set() },
    ).toPersistence();
    expect(state.reason).toBe("reported_by_bank");
  });

  it("refuse un compte déjà connu, ou dans un export en vol", () => {
    expect(() =>
      KnownBankAccount.declare(declaration, { known: new Set([FP_A]), inFlight: new Set() }),
    ).toThrow(AccountAlreadyKnownToBankError);
    expect(() =>
      KnownBankAccount.declare(declaration, { known: new Set(), inFlight: new Set([FP_A]) }),
    ).toThrow(/Café A/u);
  });
});
