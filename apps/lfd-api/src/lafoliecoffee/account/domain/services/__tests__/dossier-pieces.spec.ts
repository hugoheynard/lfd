import { dossierPieces } from "../dossier-pieces.js";

const EMPTY = {
  vatNumber: "",
  kbisDeposited: false,
  hasBillingAddress: false,
  hasDeliveryAddress: false,
};

describe("dossierPieces — le x/4 de Comptes clients", () => {
  it("ne compte rien sur un dossier vierge", () => {
    expect(dossierPieces(EMPTY)).toEqual([]);
  });

  it("rend les quatre, dans l'ordre canonique, quand tout est là", () => {
    expect(
      dossierPieces({
        vatNumber: "FR12345678901",
        kbisDeposited: true,
        hasBillingAddress: true,
        hasDeliveryAddress: true,
      }),
    ).toEqual(["vat", "kbis", "billing", "delivery"]);
  });

  it("garde l'ordre canonique quel que soit le sous-ensemble", () => {
    expect(dossierPieces({ ...EMPTY, hasDeliveryAddress: true, kbisDeposited: true })).toEqual([
      "kbis",
      "delivery",
    ]);
  });

  it("ne prend pas une TVA faite d'espaces pour une pièce fournie", () => {
    expect(dossierPieces({ ...EMPTY, vatNumber: "   " })).toEqual([]);
  });
});
