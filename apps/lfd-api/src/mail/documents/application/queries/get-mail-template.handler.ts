import type { MailEditorView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import { MailCopyAdminReader } from "../../../copy/domain/ports/mail-copy-admin.reader.js";
import { UnknownMailTemplateError } from "../../domain/mail-document-errors.js";
import { MailDocumentReader } from "../../domain/ports/mail-document.reader.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { mailEditorView, phrasesOfTemplate, startingDocumentOf } from "../mail-editor-view.js";
import { GetMailTemplateQuery } from "./get-mail-template.query.js";

/**
 * Ouvre un e-mail dans l'éditeur (plan `plan-editeur-par-blocs.md`, § 5) :
 * **ouvrir n'écrit rien** — sans ligne, le document de départ est calculé
 * ici. Les phrases et leurs variantes viennent de l'écran des textes des
 * e-mails, une seule source (§ 3).
 */
@QueryHandler(GetMailTemplateQuery)
export class GetMailTemplateHandler implements IQueryHandler<GetMailTemplateQuery, MailEditorView> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly reader: MailDocumentReader,
    private readonly copy: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
  ) {}

  /** @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre. */
  async execute(query: GetMailTemplateQuery): Promise<MailEditorView> {
    const entry = this.catalogue.find(query.template);
    if (entry === null) {
      throw new UnknownMailTemplateError(query.template);
    }
    const [state, entries, publication, orders] = await Promise.all([
      this.reader.stateOf(query.template),
      this.copy.entries(),
      this.copy.publication(),
      this.copy.sectionOrders(),
    ]);
    return mailEditorView(
      entry,
      state,
      startingDocumentOf(entry, orders, this.manifest),
      phrasesOfTemplate(query.template, this.manifest, entries, publication, orders),
    );
  }
}
