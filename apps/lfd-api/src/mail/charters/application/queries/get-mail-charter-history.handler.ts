import type { MailCharterHistoryView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailCharterReader } from "../../domain/ports/mail-charter.reader.js";
import { charterStampView } from "../mail-charter-view.js";
import { mailSpaceOfParam } from "../mail-space-param.js";
import { GetMailCharterHistoryQuery } from "./get-mail-charter-history.query.js";

/**
 * L'historique de la charte d'un espace (§ 25) : chaque version publiée,
 * gardée en ajout seul, avec ses réglages, et celle qui sert aujourd'hui.
 * Lecture pure.
 */
@QueryHandler(GetMailCharterHistoryQuery)
export class GetMailCharterHistoryHandler implements IQueryHandler<
  GetMailCharterHistoryQuery,
  MailCharterHistoryView
> {
  constructor(private readonly reader: MailCharterReader) {}

  /** @throws {UnknownMailSpaceError} l'espace n'existe pas. */
  async execute(query: GetMailCharterHistoryQuery): Promise<MailCharterHistoryView> {
    const space = mailSpaceOfParam(query.space);
    const [state, versions] = await Promise.all([
      this.reader.stateOf(space),
      this.reader.versions(space),
    ]);
    const current = state?.published?.version ?? null;
    return {
      space,
      versions: versions.map((record) => ({
        version: record.version,
        settings: record.settings,
        ...charterStampView(record.stamp),
        current: record.version === current,
      })),
    };
  }
}
