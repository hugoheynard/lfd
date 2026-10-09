import type { ContactSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ContactSettingsReader } from "../../domain/ports/contact-settings.reader.js";
import { GetContactSettingsQuery } from "./get-contact-settings.query.js";

/** Sert la carte de contact, au back-office comme à la boutique. Lecture pure. */
@QueryHandler(GetContactSettingsQuery)
export class GetContactSettingsHandler implements IQueryHandler<
  GetContactSettingsQuery,
  ContactSettingsView
> {
  constructor(private readonly settings: ContactSettingsReader) {}

  execute(): Promise<ContactSettingsView> {
    return this.settings.current();
  }
}
