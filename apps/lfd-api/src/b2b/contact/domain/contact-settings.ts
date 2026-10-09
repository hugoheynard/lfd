import {
  CONTACT_BOUNDS,
  type ContactCardText,
  type PublicContactSettingsView,
} from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { localizedText } from "./contact-text.js";

/**
 * **La carte de contact de la boutique** — ses textes pour les pros et
 * les particuliers (`nous-contacter.md`, §4).
 *
 * Pas un agrégat : un réglage unique sans transition, comme `OrderOpening`.
 * Ce qu'elle garantit : des textes rognés et bornés, et la TRACE — un réglage
 * posé porte son instant et son auteur. Un texte vide est permis : il fait
 * retomber la boutique sur son dictionnaire.
 */
export class ContactSettings {
  private constructor(
    readonly cards: { readonly b2b: ContactCardText; readonly b2c: ContactCardText },
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  static pose(input: {
    readonly settings: Pick<PublicContactSettingsView, "cards">;
    readonly at: Date;
    readonly author: StaffTrace;
  }): ContactSettings {
    const { settings } = input;
    return new ContactSettings(
      {
        b2b: card("Carte pros", settings.cards.b2b),
        b2c: card("Carte particuliers", settings.cards.b2c),
      },
      input.at,
      input.author,
    );
  }
}

function card(field: string, raw: ContactCardText): ContactCardText {
  return {
    kicker: localizedText(`${field} — surtitre`, raw.kicker, CONTACT_BOUNDS.cardKicker),
    title: localizedText(`${field} — titre`, raw.title, CONTACT_BOUNDS.cardTitle),
    body: localizedText(`${field} — phrase`, raw.body, CONTACT_BOUNDS.cardBody),
  };
}
