import type { InvoiceBuyer } from "../../entities/invoice.types.js";
import { buyerParty } from "../facturx-parties.js";
import {
  invoiceIssuanceBlockers,
  type InvoiceBuyerFacts,
  type InvoiceSellerFacts,
} from "../invoice-issuance-blockers.js";
import { InvoicePaymentTerms } from "../../value-objects/invoice-payment-terms.js";

/**
 * A43 (Hugo, 2026-10-09) : un acheteur sans adresse, ou dont le pays ne se
 * relit pas, bloque l'émission plutôt que de produire un XML refusé par
 * EN 16931 (BR-10 / BR-11).
 */
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

function buyerWith(billingAddressLines: readonly string[]): InvoiceBuyer & InvoiceBuyerFacts {
  return {
    companyId: "c1",
    name: "Café des Halles",
    legalForm: "SARL",
    siret: "73282932000074",
    siren: "732829320",
    vatNumber: "FR44732829320",
    billingAddressLines,
  };
}

function codes(lines: readonly string[]): string[] {
  return invoiceIssuanceBlockers(SELLER, buyerWith(lines)).map((blocker) => blocker.code);
}

describe("blocages d'adresse de l'acheteur", () => {
  it("refuse un acheteur sans adresse, en nommant le geste", () => {
    const [blocker] = invoiceIssuanceBlockers(SELLER, buyerWith([]));
    expect(blocker?.code).toBe("buyer_address_missing");
    expect(blocker?.message).toContain("ajoutez l'adresse de facturation de « Café des Halles »");
  });

  it("refuse une adresse faite de lignes vides comme une adresse absente", () => {
    expect(codes(["  ", ""])).toEqual(["buyer_address_missing"]);
  });

  it("refuse un pays écrit « Belgique », qui ne se relit pas", () => {
    const [blocker] = invoiceIssuanceBlockers(
      SELLER,
      buyerWith(["Rue Neuve 1", "1000 Bruxelles", "Belgique"]),
    );
    expect(blocker?.code).toBe("buyer_country_unknown");
    expect(blocker?.message).toContain("en code à deux lettres (BE, IT…)");
  });

  it("refuse une adresse sans pays", () => {
    expect(codes(["12 rue des Halles", "75001 Paris"])).toEqual(["buyer_country_unknown"]);
  });

  it("accepte « France » et un code à deux lettres", () => {
    expect(codes(["12 rue des Halles", "75001 Paris", "France"])).toEqual([]);
    expect(codes(["Rue Neuve 1", "1000 Bruxelles", "BE"])).toEqual([]);
  });

  it("n'exige ni code postal ni ville : BR-10/BR-11 ne demandent que le pays", () => {
    expect(codes(["Lieu-dit les Halles", "FR"])).toEqual([]);
  });
});

describe("le blocage et le XML lisent le pays de la même façon", () => {
  const cases: readonly (readonly string[])[] = [
    ["12 rue des Halles", "75001 Paris", "France"],
    ["Rue Neuve 1", "1000 Bruxelles", "BE"],
    ["Via Roma 3", "IT"],
    ["Rue Neuve 1", "1000 Bruxelles", "Belgique"],
    ["12 rue des Halles", "75001 Paris"],
    ["12 rue des Halles", "75001 Paris", "france métropolitaine"],
  ];

  it.each(cases)("%p : accepté ⇔ un ram:CountryID est émis", (...lines: string[]) => {
    const accepted = !codes(lines).includes("buyer_country_unknown");
    expect(buyerParty(buyerWith(lines)).includes("<ram:CountryID>")).toBe(accepted);
  });
});
