import type { MailSendDetailView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { MailSendNotFoundError } from "../../domain/errors/mail-sends.errors.js";
import { MailSendReader } from "../../domain/ports/mail-send.reader.js";
import { toMailSendDetail } from "../mail-send-views.js";
import { GetMailSendQuery } from "./get-mail-send.query.js";

/** Lit le détail d'un envoi, adresse masquée. */
@QueryHandler(GetMailSendQuery)
export class GetMailSendHandler implements IQueryHandler<GetMailSendQuery, MailSendDetailView> {
  constructor(private readonly sends: MailSendReader) {}

  /** @throws {MailSendNotFoundError} l'envoi n'est pas au suivi. */
  async execute({ sendId }: GetMailSendQuery): Promise<MailSendDetailView> {
    const record = await this.sends.detail(sendId);
    if (record === null) {
      throw new MailSendNotFoundError(sendId);
    }
    return toMailSendDetail(record);
  }
}
