import {
  validateMailDocument,
  type MailDocumentPreviewView,
  type MailLocale,
} from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import { replacementTexts } from "../../../copy/domain/mail-copy-texts.js";
import { MailCopyAdminReader } from "../../../copy/domain/ports/mail-copy-admin.reader.js";
import {
  MailDocumentRefusedError,
  UnknownMailCaseError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import { MailTemplateDocument } from "../../domain/mail-template-document.js";
import { MailDocumentReader } from "../../domain/ports/mail-document.reader.js";
import { MailDocumentPreviewRenderer } from "../../domain/ports/mail-document-preview.renderer.js";
import {
  MailTemplateCatalogue,
  type MailTemplateEntry,
} from "../../domain/ports/mail-template-catalogue.js";
import { startingDocumentOf } from "../mail-editor-view.js";
import { PreviewMailDocumentQuery } from "./preview-mail-document.query.js";

/** La langue rendue : celle demandée si le modèle la parle, sinon la sienne. */
function renderedLocale(entry: MailTemplateEntry, asked: MailLocale): MailLocale {
  return entry.declaration.locales.includes(asked)
    ? asked
    : (entry.declaration.locales[0] ?? asked);
}

/**
 * **L'aperçu fidèle** (plan `plan-editeur-par-blocs.md`, § 6) : le rendu du
 * serveur, à la demande — le document posé comme l'envoi le pose, les phrases
 * de la source demandée, les données du cas demandé. Rien n'est écrit, rien n'est envoyé.
 */
@QueryHandler(PreviewMailDocumentQuery)
export class PreviewMailDocumentHandler implements IQueryHandler<
  PreviewMailDocumentQuery,
  MailDocumentPreviewView
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly reader: MailDocumentReader,
    private readonly copy: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
    private readonly renderer: MailDocumentPreviewRenderer,
  ) {}

  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {UnknownMailCaseError} l'e-mail n'a pas ce cas.
   * @throws {MailDocumentRefusedError} le document enfreint une règle de forme.
   */
  async execute(query: PreviewMailDocumentQuery): Promise<MailDocumentPreviewView> {
    const entry = this.catalogue.find(query.template);
    if (entry === null) {
      throw new UnknownMailTemplateError(query.template);
    }
    if (!entry.cases.some((candidate) => candidate.id === query.caseId)) {
      throw new UnknownMailCaseError(query.template, query.caseId);
    }
    const [state, entries, orders] = await Promise.all([
      this.reader.stateOf(query.template),
      this.copy.entries(),
      this.copy.sectionOrders(),
    ]);
    const document =
      query.document ??
      (state === null
        ? MailTemplateDocument.untouched(query.template)
        : MailTemplateDocument.reconstitute(state)
      ).current(startingDocumentOf(entry, orders, this.manifest)).document;
    const violations = validateMailDocument(document, entry.declaration, query.template);
    if (violations.length > 0) {
      throw new MailDocumentRefusedError(query.template, "prévisualisé", violations);
    }
    const locale = renderedLocale(entry, query.locale);
    const texts = replacementTexts(entries, this.manifest, locale, query.source);
    const rendered = this.renderer.render(query.template, query.caseId, locale, texts, document);
    return { template: query.template, locale, ...rendered };
  }
}
