import {
  InvalidOrderOfferError,
  OfferNotPermittedError,
} from "../../../domain/errors/order-offer-errors.js";
import { ensureMayOffer, offerPartyOf } from "../order-offering.js";

/** Les gestes de l'offre partagés par les deux passations (`plan-commande-offerte.md`, O7-3). */
describe("ensureMayOffer", () => {
  it("laisse passer une commande qui n'est pas offerte, avec ou sans le droit", () => {
    expect(() => ensureMayOffer(false, false)).not.toThrow();
    expect(() => ensureMayOffer(false, true)).not.toThrow();
  });

  it("laisse offrir avec le droit", () => {
    expect(() => ensureMayOffer(true, true)).not.toThrow();
  });

  it("🔴 refuse d'offrir sans le droit", () => {
    expect(() => ensureMayOffer(true, false)).toThrow(OfferNotPermittedError);
  });
});

describe("offerPartyOf", () => {
  it("ne pose rien sans motif", () => {
    expect(offerPartyOf(undefined)).toEqual({});
  });

  it("pose le motif revalidé, texte rogné", () => {
    expect(
      offerPartyOf({ nature: "tasting", note: "  Dégustation  ", notifyCustomer: true }),
    ).toEqual({ offer: { nature: "tasting", note: "Dégustation", notifyCustomer: true } });
  });

  it("refuse un texte vide", () => {
    expect(() => offerPartyOf({ nature: "tasting", note: "   ", notifyCustomer: false })).toThrow(
      InvalidOrderOfferError,
    );
  });
});
