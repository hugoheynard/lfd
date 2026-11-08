import { InvalidMarketingPreferenceError } from "../errors/marketing-preference.errors.js";
import { MarketingAddress } from "../value-objects/marketing-address.js";
import type { MarketingPreferenceSnapshot } from "./marketing-preference-state.js";

/**
 * La cohérence d'une ligne relue — les mêmes règles que les contraintes de
 * ligne en base : une clé effacée n'existe que sur une désinscription, une
 * désinscription porte son instant et sa source, un accord sa confirmation.
 */
export function validSnapshot(snapshot: MarketingPreferenceSnapshot): MarketingPreferenceSnapshot {
  if (snapshot.recipientKey !== null) {
    MarketingAddress.of(snapshot.recipientKey, snapshot.print);
  } else if (snapshot.status !== "unsubscribed") {
    throw new InvalidMarketingPreferenceError(
      "une adresse effacée",
      "n'est admise que désinscrite",
    );
  }
  if (
    snapshot.status === "unsubscribed" &&
    (snapshot.unsubscribedAt === null || snapshot.unsubscribedSource === null)
  ) {
    throw new InvalidMarketingPreferenceError("une désinscription", "sans instant ni source");
  }
  if (snapshot.status === "accepted" && snapshot.confirmedAt === null) {
    throw new InvalidMarketingPreferenceError("un accord", "sans instant de confirmation");
  }
  return snapshot;
}
