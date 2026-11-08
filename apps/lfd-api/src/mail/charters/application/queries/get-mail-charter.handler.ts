import type { MailCharterView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailSpaceCharter } from "../../domain/mail-space-charter.js";
import { MailCharterReader } from "../../domain/ports/mail-charter.reader.js";
import { MailSpaceDirectory } from "../../domain/ports/mail-space-directory.js";
import { charterStampView } from "../mail-charter-view.js";
import { mailSpaceOfParam } from "../mail-space-param.js";
import { GetMailCharterQuery } from "./get-mail-charter.query.js";

/**
 * Ouvre la charte d'un espace (plan `plan-editeur-par-blocs.md`, § 25) : le
 * brouillon s'il y en a un, sinon la publiée, sinon celle de départ — tirée
 * des constantes du rendu, jamais écrite. Lecture pure.
 */
@QueryHandler(GetMailCharterQuery)
export class GetMailCharterHandler implements IQueryHandler<GetMailCharterQuery, MailCharterView> {
  constructor(
    private readonly reader: MailCharterReader,
    private readonly directory: MailSpaceDirectory,
  ) {}

  /** @throws {UnknownMailSpaceError} l'espace n'existe pas. */
  async execute(query: GetMailCharterQuery): Promise<MailCharterView> {
    const space = mailSpaceOfParam(query.space);
    const state = await this.reader.stateOf(space);
    const starting = this.directory.startingSettings(space);
    const charter =
      state === null ? MailSpaceCharter.untouched(space) : MailSpaceCharter.reconstitute(state);
    const current = charter.current(starting);
    const published = state?.published ?? null;
    const draft = state?.draft ?? null;
    return {
      space,
      templates: this.directory.templatesOf(space),
      locales: this.directory.localesOf(space),
      settings: current.settings,
      source: current.source,
      starting,
      shopFonts: this.directory.shopFontsOf(space),
      revision: charter.loadedRevision,
      published:
        published === null
          ? null
          : {
              version: published.version,
              settings: published.settings,
              ...charterStampView(published.stamp),
            },
      draft: draft === null ? null : charterStampView(draft.stamp),
    };
  }
}
