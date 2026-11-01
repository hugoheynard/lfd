import type {
  AudienceContactSettingsView,
  ContactCardText,
  CustomerAudience,
  PublicContactPhoneView,
} from "@lfd/contracts";

/**
 * **Ce que la boutique reçoit pour UNE audience** : sa carte, et ses numéros —
 * ceux de ce public ou `both`, et seulement si la carte affiche le numéro
 * (décision de Hugo, 2026-10-26).
 *
 * Construit champ par champ : la carte de l'autre public et ses numéros n'y
 * entrent pas, même vides (Hugo, 2026-11-01 : « chaque audience n'a le droit
 * qu'à son information »).
 */
export function audienceContactSettingsOf(
  cards: { readonly b2b: ContactCardText; readonly b2c: ContactCardText },
  phones: readonly PublicContactPhoneView[],
  audience: CustomerAudience,
): AudienceContactSettingsView {
  const card = cards[audience];
  return {
    phones: card.showPhone
      ? phones
          .filter((phone) => phone.audience === "both" || phone.audience === audience)
          .map((phone) => ({ label: phone.label, number: phone.number, audience: phone.audience }))
      : [],
    card,
  };
}
