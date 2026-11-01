import type { AudienceContactSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { audienceContactSettingsOf } from "../../domain/audience-contact-settings.js";
import { ContactPhoneReader } from "../../domain/ports/contact-phone.reader.js";
import { ContactSettingsReader } from "../../domain/ports/contact-settings.reader.js";
import { GetShopContactSettingsQuery } from "./get-shop-contact-settings.query.js";

/**
 * Sert à la boutique, en UN appel, la carte de l'audience déclarée et ses
 * numéros — jamais ceux de l'autre public (plan
 * `chaque-audience-son-information`, § 7.1). Lecture pure.
 */
@QueryHandler(GetShopContactSettingsQuery)
export class GetShopContactSettingsHandler implements IQueryHandler<
  GetShopContactSettingsQuery,
  AudienceContactSettingsView
> {
  constructor(
    private readonly settings: ContactSettingsReader,
    private readonly phones: ContactPhoneReader,
  ) {}

  async execute(query: GetShopContactSettingsQuery): Promise<AudienceContactSettingsView> {
    const [settings, phones] = await Promise.all([
      this.settings.current(),
      this.phones.published(),
    ]);
    return audienceContactSettingsOf(settings.cards, phones, query.audience);
  }
}
