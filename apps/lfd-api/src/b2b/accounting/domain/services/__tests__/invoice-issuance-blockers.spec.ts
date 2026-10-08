import {
  invoiceIssuanceBlockers,
  payerIssuanceBlockers,
  sellerBlockers,
  type InvoiceBuyerFacts,
  type InvoiceSellerFacts,
} from "../invoice-issuance-blockers.js";
import { InvoicePaymentTerms } from "../../value-objects/invoice-payment-terms.js";

const SELLER: InvoiceSellerFacts = {
  legalEntityId: "le1",
  name: "La Folie Douce SAS",
  legalForm: "SAS",
  rcs: "Paris B 123 456 789",
  vatNumber: "FR12123456789",
  archived: false,
  paymentTerms: InvoicePaymentTerms.create({
    latePenaltyRateBasisPoints: 1_415,
    recoveryIndemnityCents: 4_000,
    earlyPaymentDiscount: "néant",
  }),
};

const BUYER: InvoiceBuyerFacts = {
  name: "Café des Halles",
  legalForm: "SARL",
  siren: "732829320",
  vatNumber: "FR44732829320",
};

function codes(seller: InvoiceSellerFacts | null, buyer: InvoiceBuyerFacts | null): string[] {
  return invoiceIssuanceBlockers(seller, buyer).map((blocker) => blocker.code);
}

describe("invoiceIssuanceBlockers", () => {
  it("vendeur et acheteur complets : aucun manque", () => {
    expect(codes(SELLER, BUYER)).toEqual([]);
  });

  it("aucune entité en service", () => {
    expect(codes(null, BUYER)).toEqual(["no_issuer"]);
  });

  it("entité archivée", () => {
    expect(codes({ ...SELLER, archived: true }, BUYER)).toEqual(["issuer_archived"]);
  });

  it("vendeur incomplet : RCS et TVA nommés dans un seul manque", () => {
    const [blocker, ...rest] = invoiceIssuanceBlockers(
      { ...SELLER, rcs: " ", vatNumber: "" },
      BUYER,
    );
    expect(rest).toEqual([]);
    expect(blocker?.code).toBe("seller_incomplete");
    expect(blocker?.message).toContain("le RCS, le numéro de TVA intracommunautaire");
  });

  it("vendeur non assujetti : son numéro de TVA n'est pas exigé", () => {
    expect(codes({ ...SELLER, legalForm: "micro_entreprise", vatNumber: "" }, BUYER)).toEqual([]);
  });

  it("mentions de retard absentes, chacune nommée", () => {
    const blockers = invoiceIssuanceBlockers(
      { ...SELLER, paymentTerms: InvoicePaymentTerms.empty() },
      BUYER,
    );
    expect(blockers.map((blocker) => blocker.code)).toEqual(["payment_terms_missing"]);
    expect(blockers[0]?.message).toContain("le taux des pénalités de retard");
    expect(blockers[0]?.message).toContain("carte « Mentions de la facture »");
  });

  it("acheteur sans SIREN : le manque nomme le client et le geste", () => {
    const blockers = invoiceIssuanceBlockers(SELLER, { ...BUYER, siren: "" });
    expect(blockers.map((blocker) => blocker.code)).toEqual(["buyer_siren_missing"]);
    expect(blockers[0]?.message).toBe(
      "Le client « Café des Halles » n'a pas de SIREN : le renseigner (ou son SIRET) sur sa " +
        "fiche client, rubrique identité légale.",
    );
  });

  it("acheteur assujetti sans TVA ; non assujetti sans TVA : rien", () => {
    expect(codes(SELLER, { ...BUYER, vatNumber: " " })).toEqual(["buyer_vat_missing"]);
    expect(codes(SELLER, { ...BUYER, legalForm: "association", vatNumber: "" })).toEqual([]);
  });

  it("forme hors catalogue : réputée assujettie, comme `vatNumberRequired`", () => {
    expect(codes(SELLER, { ...BUYER, legalForm: "Coopérative bizarre", vatNumber: "" })).toEqual([
      "buyer_vat_missing",
    ]);
  });

  it("payeur absent de l'annuaire", () => {
    expect(codes(SELLER, null)).toEqual(["buyer_unknown"]);
  });

  it("tous les manques à la fois, le vendeur d'abord", () => {
    expect(
      codes(
        { ...SELLER, archived: true, rcs: "", paymentTerms: InvoicePaymentTerms.empty() },
        { ...BUYER, siren: "", vatNumber: "" },
      ),
    ).toEqual([
      "issuer_archived",
      "seller_incomplete",
      "payment_terms_missing",
      "buyer_siren_missing",
      "buyer_vat_missing",
    ]);
  });
});

describe("sellerBlockers", () => {
  it("ne dit rien de l'acheteur", () => {
    expect(sellerBlockers(SELLER)).toEqual([]);
  });
});

describe("payerIssuanceBlockers — l'entité qui facturera", () => {
  it("la seule entité en service", () => {
    expect(payerIssuanceBlockers([SELLER], BUYER)).toEqual([]);
  });

  it("aucune", () => {
    expect(payerIssuanceBlockers([], BUYER).map((blocker) => blocker.code)).toEqual(["no_issuer"]);
  });

  it("plusieurs : on le dit plutôt que de choisir, et l'acheteur est jugé quand même", () => {
    const blockers = payerIssuanceBlockers([SELLER, { ...SELLER, legalEntityId: "le2" }], {
      ...BUYER,
      siren: "",
    });
    expect(blockers.map((blocker) => blocker.code)).toEqual([
      "several_issuers",
      "buyer_siren_missing",
    ]);
    expect(blockers[0]?.message).toContain("2 entités émettrices");
  });
});
