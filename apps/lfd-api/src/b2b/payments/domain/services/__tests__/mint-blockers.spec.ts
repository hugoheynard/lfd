import { type MintBlockersInput, mintBlockersOf } from "../mint-blockers.js";

const COMPLETE: MintBlockersInput = {
  bankAccount: { holderLegalForm: "SARL" },
  issuerScheme: "B2B",
  debtor: { companyName: "Refuge du Col SARL", siren: "732829320" },
};

const BARE_DEBTOR = { companyName: "", siren: "" };

describe("mintBlockersOf — ce qui empêche de frapper un mandat", () => {
  it("ne rend rien quand toutes les mentions sont là", () => {
    expect(mintBlockersOf(COMPLETE)).toEqual([]);
  });

  describe("les deux blocages communs", () => {
    it("exige un RIB et un émetteur, en CORE comme en B2B", () => {
      for (const issuerScheme of ["CORE", "B2B"] as const) {
        expect(mintBlockersOf({ ...COMPLETE, issuerScheme, bankAccount: null })).toEqual([
          "bank_account_missing",
        ]);
      }
      expect(mintBlockersOf({ ...COMPLETE, issuerScheme: null })).toEqual(["issuer_missing"]);
    });

    /**
     * Sans émetteur, le schéma est inconnu : réclamer un SIREN qu'un mandat CORE
     * n'imprimerait pas enverrait saisir une donnée pour rien.
     */
    it("ne juge pas les mentions propres au schéma tant que l'émetteur manque", () => {
      expect(
        mintBlockersOf({ bankAccount: null, issuerScheme: null, debtor: BARE_DEBTOR }),
      ).toEqual(["bank_account_missing", "issuer_missing"]);
    });
  });

  describe("CORE — rien de plus qu'avant", () => {
    it("frappe sans raison sociale, SIREN ni forme juridique du titulaire", () => {
      expect(
        mintBlockersOf({
          bankAccount: { holderLegalForm: "" },
          issuerScheme: "CORE",
          debtor: BARE_DEBTOR,
        }),
      ).toEqual([]);
    });
  });

  describe("B2B — les trois mentions du formulaire interentreprises", () => {
    it("rend la liste exacte, dans l'ordre du contrat", () => {
      expect(
        mintBlockersOf({
          bankAccount: { holderLegalForm: "" },
          issuerScheme: "B2B",
          debtor: BARE_DEBTOR,
        }),
      ).toEqual(["company_name_missing", "siren_missing", "holder_legal_form_missing"]);
    });

    it("tient des blancs pour une absence", () => {
      expect(
        mintBlockersOf({
          bankAccount: { holderLegalForm: "   " },
          issuerScheme: "B2B",
          debtor: { companyName: " ", siren: "  " },
        }),
      ).toEqual(["company_name_missing", "siren_missing", "holder_legal_form_missing"]);
    });

    it.each([
      [
        "la raison sociale",
        { debtor: { ...COMPLETE.debtor, companyName: "" } },
        "company_name_missing",
      ],
      ["le SIREN", { debtor: { ...COMPLETE.debtor, siren: "" } }, "siren_missing"],
      [
        "la forme juridique du titulaire",
        { bankAccount: { holderLegalForm: "" } },
        "holder_legal_form_missing",
      ],
    ] as const)("nomme %s seule quand c'est la seule absente", (_label, over, blocker) => {
      expect(mintBlockersOf({ ...COMPLETE, ...over })).toEqual([blocker]);
    });

    /** Sans RIB, `bank_account_missing` mène déjà au dialogue qui saisit la forme juridique. */
    it("ne réclame pas la forme juridique d'un RIB qui n'existe pas", () => {
      expect(mintBlockersOf({ ...COMPLETE, bankAccount: null })).toEqual(["bank_account_missing"]);
    });
  });
});
