import type { MailDocumentHistoryView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { UnknownMailTemplateError } from "../../domain/mail-document-errors.js";
import { MailDocumentReader } from "../../domain/ports/mail-document.reader.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { stampView } from "../mail-editor-view.js";
import { GetMailDocumentHistoryQuery } from "./get-mail-document-history.query.js";

/**
 * L'historique d'un e-mail (§ 6) : chaque version publiée, gardée en ajout
 * seul, et celle qui part aujourd'hui — aucune après un retour au modèle
 * d'origine. Lecture pure.
 */
@QueryHandler(GetMailDocumentHistoryQuery)
export class GetMailDocumentHistoryHandler implements IQueryHandler<
  GetMailDocumentHistoryQuery,
  MailDocumentHistoryView
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly reader: MailDocumentReader,
  ) {}

  /** @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre. */
  async execute(query: GetMailDocumentHistoryQuery): Promise<MailDocumentHistoryView> {
    if (this.catalogue.find(query.template) === null) {
      throw new UnknownMailTemplateError(query.template);
    }
    const [state, versions] = await Promise.all([
      this.reader.stateOf(query.template),
      this.reader.versions(query.template),
    ]);
    const current = state?.published?.version ?? null;
    const retracted = state?.retracted ?? null;
    return {
      template: query.template,
      versions: versions.map((record) => ({
        version: record.version,
        ...stampView(record.stamp),
        current: record.version === current,
      })),
      retracted: retracted === null ? null : stampView(retracted),
    };
  }
}
