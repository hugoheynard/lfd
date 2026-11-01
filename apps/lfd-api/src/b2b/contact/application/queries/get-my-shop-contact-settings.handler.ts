import type { AudienceContactSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { audienceContactSettingsOf } from "../../domain/audience-contact-settings.js";
import { ContactPhoneReader } from "../../domain/ports/contact-phone.reader.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { ContactSettingsReader } from "../../domain/ports/contact-settings.reader.js";
import { GetMyShopContactSettingsQuery } from "./get-my-shop-contact-settings.query.js";

/**
 * **La carte de qui est connecté.** Son public se lit par la règle même du
 * message connecté (`ContactSenderAudience` : société active → `b2b`, sinon
 * `b2c`) : la carte qu'il lit est celle du public dont son message relèvera.
 */
@QueryHandler(GetMyShopContactSettingsQuery)
export class GetMyShopContactSettingsHandler implements IQueryHandler<
  GetMyShopContactSettingsQuery,
  AudienceContactSettingsView
> {
  constructor(
    private readonly settings: ContactSettingsReader,
    private readonly phones: ContactPhoneReader,
    private readonly audiences: ContactSenderAudience,
  ) {}

  async execute(query: GetMyShopContactSettingsQuery): Promise<AudienceContactSettingsView> {
    const [settings, phones, audience] = await Promise.all([
      this.settings.current(),
      this.phones.published(),
      this.audiences.of(query.companyId),
    ]);
    return audienceContactSettingsOf(settings.cards, phones, audience);
  }
}
