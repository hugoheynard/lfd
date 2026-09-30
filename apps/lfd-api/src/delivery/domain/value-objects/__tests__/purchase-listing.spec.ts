import {
  InvalidPurchasePriceError,
  InvalidPurchaseTextError,
  InvalidPurchaseUrlError,
} from "../../errors/delivery-purchase-errors.js";
import { PURCHASE_TEXT_MAX_LENGTH, PurchaseListing, purchaseTextOf } from "../purchase-listing.js";

describe("PurchaseListing", () => {
  it("rend tout à null quand rien n'est renseigné", () => {
    expect(PurchaseListing.of({}).toState()).toEqual({
      reference: null,
      purchaseUrl: null,
      priceCentsExclVat: null,
    });
  });

  it("lit une case vidée comme non renseignée", () => {
    expect(PurchaseListing.of({ reference: "  ", purchaseUrl: "" }).toState()).toEqual({
      reference: null,
      purchaseUrl: null,
      priceCentsExclVat: null,
    });
  });

  it("garde référence, lien et prix", () => {
    expect(
      PurchaseListing.of({
        reference: " KL2 ",
        purchaseUrl: "https://exemple.fr/k",
        priceCentsExclVat: 0,
      }).toState(),
    ).toEqual({ reference: "KL2", purchaseUrl: "https://exemple.fr/k", priceCentsExclVat: 0 });
  });

  it("refuse une référence trop longue, un lien http, un prix négatif", () => {
    expect(() =>
      PurchaseListing.of({ reference: "x".repeat(PURCHASE_TEXT_MAX_LENGTH + 1) }),
    ).toThrow(InvalidPurchaseTextError);
    expect(() => PurchaseListing.of({ purchaseUrl: "http://exemple.fr" })).toThrow(
      InvalidPurchaseUrlError,
    );
    expect(() => PurchaseListing.of({ priceCentsExclVat: -1 })).toThrow(InvalidPurchasePriceError);
  });

  it("nomme le champ trop long dans le refus", () => {
    expect(() =>
      purchaseTextOf("Le fournisseur", "x".repeat(PURCHASE_TEXT_MAX_LENGTH + 1)),
    ).toThrow(/Le fournisseur tient en 120 caractères/u);
  });
});
