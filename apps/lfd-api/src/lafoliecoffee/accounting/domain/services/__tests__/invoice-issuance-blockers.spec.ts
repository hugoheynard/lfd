import {
  invoiceIssuanceBlockers,
  orderDeliveryBlockers,
  orderSettlementBlockers,
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
  invoicePrefix: "LFD",
};

const BUYER: InvoiceBuyerFacts = {
  name: "Café des Halles",
  legalForm: "SARL",
  siren: "732829320",
  vatNumber: "FR44732829320",
  billingAddressLines: ["12 rue des Halles", "75001 Paris", "France"],
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

describe("le préfixe et la date de livraison (lot ZA)", () => {
  it("une entité sans préfixe ne peut pas émettre : le manque dit où le poser", () => {
    const blockers = sellerBlockers({ ...SELLER, invoicePrefix: null });
    expect(blockers.map((b) => b.code)).toEqual(["invoice_prefix_missing"]);
    expect(blockers[0]?.message).toContain("La Folie Douce SAS");
    expect(blockers[0]?.message).toContain("Comptabilité › Entités juridiques");
    expect(blockers[0]?.message).toContain("Numérotation des factures");
  });

  it("un bon sans date de livraison : un manque par bon, qui le nomme avec le geste", () => {
    const blockers = orderDeliveryBlockers([
      { reference: "ORD-001", receivedOn: "2026-09-12" },
      { reference: "ORD-002", receivedOn: null },
      { reference: "ORD-003", receivedOn: null },
    ]);
    expect(blockers.map((b) => b.code)).toEqual([
      "order_delivery_unknown",
      "order_delivery_unknown",
    ]);
    expect(blockers[0]?.message).toContain("Le bon ORD-002 n'a pas de date de livraison");
    expect(blockers[1]?.message).toContain("Le bon ORD-003");
    expect(blockers[0]?.message).toContain("Enregistrer son retrait ou sa livraison");
  });

  it("tous les bons datés : aucun manque", () => {
    expect(orderDeliveryBlockers([{ reference: "ORD-001", receivedOn: "2026-09-12" }])).toEqual([]);
  });
});

describe("orderSettlementBlockers — un bon remis mais pas soldé (plan E6c2, § 1)", () => {
  it("nomme le bon dont les montants facturables ne sont pas posés, et le geste de sortie", () => {
    const blockers = orderSettlementBlockers([
      { reference: "ORD-001", receivedOn: "2030-01-10" },
      { reference: "ORD-002", receivedOn: "2030-01-10", unsettled: true },
    ]);
    expect(blockers.map((blocker) => blocker.code)).toEqual(["order_unsettled"]);
    expect(blockers[0]?.message).toContain("ORD-002 est remis, aucun reste n'est attendu");
    expect(blockers[0]?.message).toContain("POST admin/delivery-notes/reconcile");
  });

  /** Régression d'E6c1 : un départ incomplet SOLDÉ ne bloque plus la facture de son payeur. */
  it("ne retient plus un bon soldé, départ incomplet ou non", () => {
    expect(orderSettlementBlockers([{ reference: "ORD-003", receivedOn: "2030-01-10" }])).toEqual(
      [],
    );
  });
});
