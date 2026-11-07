import type { MailEditorListView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailDocumentReader } from "../../domain/ports/mail-document.reader.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { publishedView } from "../mail-editor-view.js";
import { ListMailTemplatesQuery } from "./list-mail-templates.query.js";

/**
 * La liste des e-mails (plan `plan-editeur-par-blocs.md`, § 6) : le registre
 * du code, dans son ordre, chacun avec son destinataire — l'écran les range
 * par là — et ce qu'il en est de son document. Lecture pure.
 */
@QueryHandler(ListMailTemplatesQuery)
export class ListMailTemplatesHandler implements IQueryHandler<
  ListMailTemplatesQuery,
  MailEditorListView
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly reader: MailDocumentReader,
  ) {}

  async execute(): Promise<MailEditorListView> {
    const states = new Map((await this.reader.all()).map((state) => [state.template, state]));
    return {
      mails: this.catalogue.list().map((entry) => {
        const state = states.get(entry.template) ?? null;
        return {
          template: entry.template,
          audience: entry.audience,
          family: entry.family,
          charter: entry.declaration.charter,
          locales: entry.declaration.locales,
          published: publishedView(state),
          hasDraft: (state?.draft ?? null) !== null,
        };
      }),
    };
  }
}
