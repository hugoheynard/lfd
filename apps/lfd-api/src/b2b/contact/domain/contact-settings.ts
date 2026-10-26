import {
  CONTACT_BOUNDS,
  type ContactCardText,
  type PublicContactSettingsView,
} from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { assertCardsReachable, CARD_NAMES, type ReachPhone } from "./contact-reach.js";
import { localizedText } from "./contact-text.js";
import { ContactCardSilentError } from "./errors/contact-errors.js";

/**
 * **La carte de contact de la boutique** — pour les pros et les particuliers :
 * ses textes, ses deux boutons, et ce qu'elle offre (`demandes-clients.md`, §4).
 *
 * Pas un agrégat : un réglage unique sans transition, comme `OrderOpening`.
 * Ce qu'elle garantit : des textes rognés et bornés, la TRACE — un réglage
 * posé porte son instant et son auteur —, et qu'une carte qui n'offre ni
 * numéro ni formulaire dit quelque chose, et qu'une carte qui affiche le
 * numéro en a un (décision de Hugo, 2026-10-26). Un
 * autre texte vide est permis : il fait retomber la boutique sur son dictionnaire.
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
    /** Les numéros réglés : une carte qui affiche le numéro doit en avoir un. */
    readonly phones: readonly ReachPhone[];
  }): ContactSettings {
    const { settings } = input;
    const cards = {
      b2b: card(CARD_NAMES.b2b, settings.cards.b2b),
      b2c: card(CARD_NAMES.b2c, settings.cards.b2c),
    };
    assertCardsReachable(cards, input.phones);
    return new ContactSettings(cards, input.at, input.author);
  }
}

function card(field: string, raw: ContactCardText): ContactCardText {
  const posed: ContactCardText = {
    kicker: localizedText(`${field} — surtitre`, raw.kicker, CONTACT_BOUNDS.cardKicker),
    title: localizedText(`${field} — titre`, raw.title, CONTACT_BOUNDS.cardTitle),
    body: localizedText(`${field} — phrase`, raw.body, CONTACT_BOUNDS.cardBody),
    callLabel: localizedText(`${field} — bouton d'appel`, raw.callLabel, CONTACT_BOUNDS.cardButton),
    writeLabel: localizedText(
      `${field} — bouton d'écriture`,
      raw.writeLabel,
      CONTACT_BOUNDS.cardButton,
    ),
    showPhone: raw.showPhone,
    showForm: raw.showForm,
    noContactMessage: localizedText(
      `${field} — message sans contact`,
      raw.noContactMessage,
      CONTACT_BOUNDS.cardNoContact,
    ),
  };
  // Le français est la langue de repli : vide en français, il n'y a rien à dire.
  if (!posed.showPhone && !posed.showForm && posed.noContactMessage.fr === "") {
    throw new ContactCardSilentError(field);
  }
  return posed;
}
