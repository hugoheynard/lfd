import type { ContactPhoneView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ContactPhoneReader } from "../../domain/ports/contact-phone.reader.js";
import { ListContactPhonesQuery } from "./list-contact-phones.query.js";

/** Sert les numéros au back-office. Lecture pure. */
@QueryHandler(ListContactPhonesQuery)
export class ListContactPhonesHandler implements IQueryHandler<
  ListContactPhonesQuery,
  ContactPhoneView[]
> {
  constructor(private readonly phones: ContactPhoneReader) {}

  execute(): Promise<ContactPhoneView[]> {
    return this.phones.list();
  }
}
