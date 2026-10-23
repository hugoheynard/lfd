import { AccountBankExport, type ExportAccountsInput } from "../account-bank-export.js";
import {
  KNOWN_BANK_ACCOUNT_REASONS,
  KnownBankAccount,
  knownBankAccountReason,
} from "../known-bank-account.js";
import {
  AccountAlreadyKnownToBankError,
  AccountInFlightNotEnterableError,
  AccountNotInDownloadedExportError,
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

  const none = {
    known: new Set<string>(),
    inFlight: new Set<string>(),
    inDownloadedExport: new Set<string>(),
  };
  const inExport = (downloaded: boolean) => ({
    known: new Set<string>(),
    inFlight: new Set([FP_A]),
    inDownloadedExport: new Set(downloaded ? [FP_A] : []),
  });
  const reported = { ...declaration, reason: KNOWN_BANK_ACCOUNT_REASONS.reportedByBank };

  it("« saisi dans CENET » : pose l'empreinte d'un compte à exporter, sans le nom de la société", () => {
    const state = KnownBankAccount.declare(declaration, none).toPersistence();
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

  it("« saisi dans CENET » est refusé pour un compte en vol, téléchargé ou non", () => {
    for (const downloaded of [false, true]) {
      expect(() => KnownBankAccount.declare(declaration, inExport(downloaded))).toThrow(
        AccountInFlightNotEnterableError,
      );
    }
    expect(() => KnownBankAccount.declare(declaration, inExport(true))).toThrow(/Café A/u);
  });

  it("« signalé par la banque » : accepté pour un compte d'un export téléchargé", () => {
    const state = KnownBankAccount.declare(reported, inExport(true)).toPersistence();
    expect(state.reason).toBe("reported_by_bank");
  });

  it("« signalé par la banque » est refusé hors d'un export téléchargé", () => {
    expect(() => KnownBankAccount.declare(reported, none)).toThrow(
      AccountNotInDownloadedExportError,
    );
    expect(() => KnownBankAccount.declare(reported, inExport(false))).toThrow(
      AccountNotInDownloadedExportError,
    );
  });

  it("refuse, pour les deux raisons, un compte déjà connu", () => {
    const known = { ...none, known: new Set([FP_A]) };
    expect(() => KnownBankAccount.declare(declaration, known)).toThrow(
      AccountAlreadyKnownToBankError,
    );
    expect(() => KnownBankAccount.declare(reported, known)).toThrow(AccountAlreadyKnownToBankError);
  });
});
