import type { ContactMessageView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ContactMessageReader } from "../../domain/ports/contact-message.reader.js";
import { ListContactMessagesQuery } from "./list-contact-messages.query.js";

/**
 * Combien de messages une liste rend au plus. « À traiter » vise zéro ;
 * « traités » se lit par le haut, et l'ancien s'anonymise de toute façon.
 */
export const CONTACT_MESSAGES_LIST_LIMIT = 200;

/** Sert la liste des messages au back-office. Lecture pure. */
@QueryHandler(ListContactMessagesQuery)
export class ListContactMessagesHandler implements IQueryHandler<
  ListContactMessagesQuery,
  ContactMessageView[]
> {
  constructor(private readonly messages: ContactMessageReader) {}

  execute(query: ListContactMessagesQuery): Promise<ContactMessageView[]> {
    return this.messages.list(query.status, CONTACT_MESSAGES_LIST_LIMIT);
  }
}
