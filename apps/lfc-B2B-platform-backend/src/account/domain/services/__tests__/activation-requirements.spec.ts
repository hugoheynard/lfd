import type { PlatformSettings } from "@lfd/contracts";

import type { AdminCompanyDetailView } from "../../ports/admin-company.reader.js";
import { missingRequiredPieces } from "../activation-requirements.js";

/** Fiche de base : assujettie TVA, aucune pièce présente. */
function detail(over: Partial<AdminCompanyDetailView> = {}): AdminCompanyDetailView {
  return {
    id: "company_1",
    reference: "C-1",
    raisonSociale: "Café",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "12345678901234",
    tvaIntracom: "",
    status: "pending",
    paymentTerm: "per_order",
    requestedPaymentTerm: null,
    primaryContact: {
      id: null,
      firstName: "L",
      lastName: "M",
      fonction: "",
      email: "l@m.fr",
      phone: "",
    },
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: "2026-07-30T10:00:00.000Z",
    vatNumberRequired: true,
    addresses: { billing: null, deliveries: [] },
    ...over,
  };
}

const allRequired: PlatformSettings = {
  tva: "required",
  kbis: "required",
  billing: "required",
  delivery: "required",
};

describe("missingRequiredPieces", () => {
  it("liste toutes les pièces required absentes", () => {
    expect(missingRequiredPieces(detail(), allRequired)).toEqual([
      "tva",
      "kbis",
      "billing",
      "delivery",
    ]);
  });

  it("ne bloque pas sur une pièce optional ou hidden, même absente", () => {
    const settings: PlatformSettings = {
      tva: "optional",
      kbis: "hidden",
      billing: "required",
      delivery: "hidden",
    };
    expect(missingRequiredPieces(detail(), settings)).toEqual(["billing"]);
  });

  it("TVA non assujettie = jamais manquante, même en required", () => {
    expect(missingRequiredPieces(detail({ vatNumberRequired: false }), allRequired)).not.toContain(
      "tva",
    );
  });

  it("renvoie [] quand toutes les pièces required sont présentes", () => {
    const complete = detail({
      tvaIntracom: "FR123",
      kbis: { fileName: "k.pdf", uploadedAt: "2026-07-30T10:00:00.000Z", certified: false },
      addresses: {
        billing: {
          label: "",
          ligne1: "1 rue",
          ligne2: "",
          codePostal: "75001",
          ville: "Paris",
          pays: "France",
        },
        deliveries: [
          {
            id: "addr_1",
            label: "",
            ligne1: "1 rue",
            ligne2: "",
            codePostal: "75001",
            ville: "Paris",
            pays: "France",
            isDefault: true,
            specs: {
              note: "",
              slots: { mode: "everyday", slot: null },
              deliveryContact: null,
              gps: null,
            },
          },
        ],
      },
    });
    expect(missingRequiredPieces(complete, allRequired)).toEqual([]);
  });
});
