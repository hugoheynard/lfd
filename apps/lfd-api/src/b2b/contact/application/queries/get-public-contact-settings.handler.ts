import type { PublicContactSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ContactPhoneReader } from "../../domain/ports/contact-phone.reader.js";
import { ContactSettingsReader } from "../../domain/ports/contact-settings.reader.js";
import { GetPublicContactSettingsQuery } from "./get-public-contact-settings.query.js";

/**
 * Sert à la boutique, en UN appel, ses numéros publiés et les textes de ses
 * cartes ; l'instant et l'auteur restent au back-office. Lecture pure.
 */
@QueryHandler(GetPublicContactSettingsQuery)
export class GetPublicContactSettingsHandler implements IQueryHandler<
  GetPublicContactSettingsQuery,
  PublicContactSettingsView
> {
  constructor(
    private readonly settings: ContactSettingsReader,
    private readonly phones: ContactPhoneReader,
  ) {}

  async execute(): Promise<PublicContactSettingsView> {
    const [settings, phones] = await Promise.all([
      this.settings.current(),
      this.phones.published(),
    ]);
    return { phones, cards: settings.cards };
  }
}
