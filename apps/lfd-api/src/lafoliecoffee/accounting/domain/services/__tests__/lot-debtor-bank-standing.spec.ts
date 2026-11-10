import { debitedAccount, IBAN_A } from "./account-for-bank-export.fixture.js";
import { accountFingerprint } from "../account-fingerprint.js";
import {
  bankReferentialStandingOf,
  lotDebtorGaps,
  type LotDebtorLine,
} from "../lot-debtor-bank-standing.js";
import type { MandateForBankExport } from "../../ports/mandates-for-bank-export.reader.js";

/** Le référentiel de CENET par débiteur d'un lot (P4 révisé) — pur, sans doublé. */

function mandate(id: string): MandateForBankExport {
  return {
    mandateId: id,
    reference: `RUM-${id}`,
    debtorCompanyId: `cmp_${id}`,
    iban: IBAN_A,
    bic: "BNPAFRPP",
    signedAt: new Date("2026-09-14T22:00:00.000Z"),
    scheme: "B2B",
    paymentType: "recurrent",
  };
}

function line(mandateId: string, batchId = "b1"): LotDebtorLine {
  return {
    batchId,
    scheme: "CORE",
    mandateId,
    mandateReference: `RUM-${mandateId}`,
    debtorName: `Société ${mandateId}`,
  };
}

const FINGERPRINT = accountFingerprint(IBAN_A);
const NOTHING_KNOWN = {
  known: new Set<string>(),
  inFlight: new Set<string>(),
  inDownloadedExport: new Set<string>(),
};

describe("le référentiel de CENET par débiteur du lot", () => {
  it("mandat et compte importés : aucun écart", () => {
    const standing = bankReferentialStandingOf(
      { exportable: [mandate("m1")], excluded: [] },
      {
        imported: [{ mandateId: "m1", rum: "RUM-m1", accountFingerprint: FINGERPRINT }],
        inFlight: [],
      },
      { exportable: [debitedAccount("a")], excluded: [] },
      { ...NOTHING_KNOWN, known: new Set([FINGERPRINT]) },
    );

    expect(lotDebtorGaps([line("m1")], standing)).toEqual([]);
  });

  it("compte déclaré connu, mandat en export : le mandat manque", () => {
    const standing = bankReferentialStandingOf(
      { exportable: [mandate("m1")], excluded: [] },
      {
        imported: [],
        inFlight: [{ mandateId: "m1", rum: "RUM-m1", accountFingerprint: FINGERPRINT }],
      },
      { exportable: [debitedAccount("a")], excluded: [] },
      { ...NOTHING_KNOWN, known: new Set([FINGERPRINT]) },
    );

    expect(lotDebtorGaps([line("m1")], standing)).toMatchObject([
      { account: "known", mandate: "in_export" },
    ]);
  });

  it("mandat écarté de l'export : nommé, sans compte à comparer", () => {
    const standing = bankReferentialStandingOf(
      {
        exportable: [],
        excluded: [
          { mandateId: "m1", reference: "RUM-m1", debtorCompanyId: "c", reason: "no_bic" },
        ],
      },
      { imported: [], inFlight: [] },
      { exportable: [], excluded: [] },
      NOTHING_KNOWN,
    );

    expect(lotDebtorGaps([line("m1")], standing)).toMatchObject([
      { account: null, mandate: "excluded" },
    ]);
  });

  it("mandat qui n'est plus actif : nommé « inactive »", () => {
    const standing = bankReferentialStandingOf(
      { exportable: [], excluded: [] },
      { imported: [], inFlight: [] },
      { exportable: [], excluded: [] },
      NOTHING_KNOWN,
    );

    expect(lotDebtorGaps([line("m1")], standing)).toMatchObject([
      { mandateReference: "RUM-m1", account: null, mandate: "inactive" },
    ]);
  });

  it("compte du mandat inconnu des exports de comptes (écarté, sans BIC) : « excluded »", () => {
    const standing = bankReferentialStandingOf(
      { exportable: [mandate("m1")], excluded: [] },
      { imported: [], inFlight: [] },
      { exportable: [], excluded: [] },
      NOTHING_KNOWN,
    );

    expect(lotDebtorGaps([line("m1")], standing)).toMatchObject([
      { account: "excluded", mandate: "not_exported" },
    ]);
  });

  it("deux lignes du même mandat dans un lot : un seul débiteur ; dans deux lots : deux", () => {
    const standing = bankReferentialStandingOf(
      { exportable: [mandate("m1")], excluded: [] },
      { imported: [], inFlight: [] },
      { exportable: [debitedAccount("a")], excluded: [] },
      NOTHING_KNOWN,
    );

    const gaps = lotDebtorGaps([line("m1"), line("m1"), line("m1", "b2")], standing);

    expect(gaps.map((gap) => gap.batchId)).toEqual(["b1", "b2"]);
  });
});
