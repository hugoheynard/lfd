import { AccountBankExportOutdatedError } from "../../errors/account-bank-export-errors.js";
import type { KnownAccountFingerprints } from "../../ports/account-bank-exports.reader.js";
import {
  currentAccountsOf,
  fingerprintedAccounts,
  selectAccountsForBankExport,
} from "../account-bank-export-selection.js";
import { accountFingerprint } from "../account-fingerprint.js";
import { IBAN_A, IBAN_B, IBAN_DE, debitedAccount } from "./account-for-bank-export.fixture.js";

const NOTHING: KnownAccountFingerprints = { known: new Set(), inFlight: new Set() };

describe("un compte = une ligne (R5)", () => {
  it("deux RIB au même IBAN ne font qu'une ligne : le plus ancien", () => {
    const entries = fingerprintedAccounts([
      debitedAccount("b", { recordedAt: new Date("2026-09-02T00:00:00.000Z") }),
      debitedAccount("a"),
    ]);
    expect(entries.map((entry) => entry.account.bankAccountId)).toEqual(["rib_a"]);
  });

  it("trie par dépôt du RIB, puis par id", () => {
    const entries = fingerprintedAccounts([
      debitedAccount("c", { iban: IBAN_DE, recordedAt: new Date("2026-08-01T00:00:00.000Z") }),
      debitedAccount("b", { iban: IBAN_B }),
      debitedAccount("a"),
    ]);
    expect(entries.map((entry) => entry.account.bankAccountId)).toEqual([
      "rib_c",
      "rib_a",
      "rib_b",
    ]);
  });
});

describe("« à exporter » (§ 2.1)", () => {
  const a = debitedAccount("a");
  const b = debitedAccount("b", { iban: IBAN_B });
  const de = debitedAccount("de", { iban: IBAN_DE });

  it("écarte ce que la banque connaît et ce qui est en vol", () => {
    const selection = selectAccountsForBankExport([a, b, de], {
      known: new Set([accountFingerprint(IBAN_A)]),
      inFlight: new Set([accountFingerprint(IBAN_B)]),
    });
    expect(selection.toExport.map((entry) => entry.account.bankAccountId)).toEqual(["rib_de"]);
    expect(selection.inFlight.map((entry) => entry.account.bankAccountId)).toEqual(["rib_b"]);
    expect(selection.known.map((entry) => entry.account.bankAccountId)).toEqual(["rib_a"]);
  });

  it("un compte connu ET en vol (réimporté) se compte connu, une fois", () => {
    const both = new Set([accountFingerprint(IBAN_A)]);
    const selection = selectAccountsForBankExport([a], { known: both, inFlight: both });
    expect(selection.known).toHaveLength(1);
    expect(selection.inFlight).toHaveLength(0);
  });

  it("un RIB changé a une autre empreinte : il ressort tout seul", () => {
    const selection = selectAccountsForBankExport([b], {
      known: new Set([accountFingerprint(IBAN_A)]),
      inFlight: new Set(),
    });
    expect(selection.toExport).toHaveLength(1);
  });

  it("sans rien de connu, tout est à exporter", () => {
    expect(selectAccountsForBankExport([a, b], NOTHING).toExport).toHaveLength(2);
  });
});

describe("le fichier d'un export, relu aujourd'hui", () => {
  const line = (id: string, iban: string) => ({
    bankAccountId: `rib_${id}`,
    companyId: `cmp_${id}`,
    accountFingerprint: accountFingerprint(iban),
  });

  it("rend les comptes actuels dans l'ordre de l'export", () => {
    const current = [debitedAccount("a"), debitedAccount("b", { iban: IBAN_B })];
    const accounts = currentAccountsOf([line("b", IBAN_B), line("a", IBAN_A)], current);
    expect(accounts.map((account) => account.bankAccountId)).toEqual(["rib_b", "rib_a"]);
  });

  it("refuse (409) un compte dont le RIB a changé, en nommant la société", () => {
    const current = [debitedAccount("a", { iban: IBAN_B, companyName: "Café Changé" })];
    expect(() => currentAccountsOf([line("a", IBAN_A)], current)).toThrow(
      AccountBankExportOutdatedError,
    );
    expect(() => currentAccountsOf([line("a", IBAN_A)], current)).toThrow(/Café Changé/u);
  });
});
