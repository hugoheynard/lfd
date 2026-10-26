import type { PublicContactPhoneView, PublicContactSettingsView } from "@lfd/contracts";

/**
 * **Les numéros que la boutique reçoit** : ceux qu'au moins une carte de leur
 * public affiche (décision de Hugo, 2026-10-26). Un numéro `b2b` sous une
 * carte pros dont le numéro est coupé n'est pas servi ; un numéro `both` l'est
 * tant qu'une des deux cartes l'affiche — la boutique filtre ensuite par carte.
 */
export function servedPhones(
  cards: PublicContactSettingsView["cards"],
  phones: readonly PublicContactPhoneView[],
): readonly PublicContactPhoneView[] {
  return phones.filter((phone) =>
    phone.audience === "both"
      ? cards.b2b.showPhone || cards.b2c.showPhone
      : cards[phone.audience].showPhone,
  );
}
