import type { MailEditorPhrasesView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import { MailCopyAdminReader } from "../../../copy/domain/ports/mail-copy-admin.reader.js";
import { UnknownMailTemplateError } from "../../domain/mail-document-errors.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { phrasesOfTemplate } from "../mail-editor-phrases.js";
import { GetMailTemplatePhrasesQuery } from "./get-mail-template-phrases.query.js";

/**
 * Les phrases d'un e-mail (S4d) : la même lecture que l'ouverture de
 * l'éditeur (`GetMailTemplateHandler`), sans le document. Une seule source,
 * le dictionnaire et ses réécritures (§ 3).
 */
@QueryHandler(GetMailTemplatePhrasesQuery)
export class GetMailTemplatePhrasesHandler implements IQueryHandler<
  GetMailTemplatePhrasesQuery,
  MailEditorPhrasesView
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly copy: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
  ) {}

  /** @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre. */
  async execute(query: GetMailTemplatePhrasesQuery): Promise<MailEditorPhrasesView> {
    if (this.catalogue.find(query.template) === null) {
      throw new UnknownMailTemplateError(query.template);
    }
    const [entries, publication, orders] = await Promise.all([
      this.copy.entries(),
      this.copy.publication(),
      this.copy.sectionOrders(),
    ]);
    return {
      template: query.template,
      ...phrasesOfTemplate(query.template, this.manifest, entries, publication, orders),
    };
  }
}
