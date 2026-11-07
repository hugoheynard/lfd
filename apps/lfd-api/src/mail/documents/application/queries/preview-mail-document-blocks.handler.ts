import {
  isEditablePhrase,
  validateMailDocument,
  type MailDocumentBlockPreviewView,
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
import { MailBlockPreviewRenderer } from "../../domain/ports/mail-block-preview.renderer.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { phrasesOfTemplate } from "../mail-editor-phrases.js";
import { renderedLocale } from "../rendered-locale.js";
import { PreviewMailDocumentBlocksQuery } from "./preview-mail-document-blocks.query.js";

/**
 * **L'aperçu par blocs** (plan `plan-editeur-par-blocs.md`, § 22, S5f) : le
 * document de l'écran, rendu par le serveur bloc par bloc. Les variantes des
 * phrases viennent de la lecture même de `GET …/phrases` (`phrasesOfTemplate`) :
 * un `data-phrase` rendu nomme un chemin que l'écran connaît, avec la
 * variante qu'il affiche ; une phrase que la déclaration ne laisse pas
 * réécrire (§ 23, `editablePhrases`) n'est pas marquée. Rien n'est écrit,
 * rien n'est envoyé.
 */
@QueryHandler(PreviewMailDocumentBlocksQuery)
export class PreviewMailDocumentBlocksHandler implements IQueryHandler<
  PreviewMailDocumentBlocksQuery,
  MailDocumentBlockPreviewView
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly copy: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
    private readonly renderer: MailBlockPreviewRenderer,
  ) {}

  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {UnknownMailCaseError} l'e-mail n'a pas ce cas.
   * @throws {MailDocumentRefusedError} le document enfreint une règle de forme.
   */
  async execute(query: PreviewMailDocumentBlocksQuery): Promise<MailDocumentBlockPreviewView> {
    const entry = this.catalogue.find(query.template);
    if (entry === null) {
      throw new UnknownMailTemplateError(query.template);
    }
    if (!entry.cases.some((candidate) => candidate.id === query.caseId)) {
      throw new UnknownMailCaseError(query.template, query.caseId);
    }
    const violations = validateMailDocument(query.document, entry.declaration, query.template);
    if (violations.length > 0) {
      throw new MailDocumentRefusedError(query.template, "prévisualisé", violations);
    }
    const [entries, publication, orders] = await Promise.all([
      this.copy.entries(),
      this.copy.publication(),
      this.copy.sectionOrders(),
    ]);
    const { phrases } = phrasesOfTemplate(
      query.template,
      this.manifest,
      entries,
      publication,
      orders,
    );
    // Seules les phrases que l'éditeur laisse réécrire sont marquées (§ 23) :
    // un libellé système se lit dans le bloc, il ne s'y écrit pas.
    const variants = new Map(
      phrases
        .filter((phrase) => isEditablePhrase(entry.declaration, phrase.path))
        .map((phrase) => [phrase.path, phrase.variant] as const),
    );
    const locale = renderedLocale(entry, query.locale);
    const texts = replacementTexts(entries, this.manifest, locale, query.source);
    const rendered = this.renderer.render(
      query.template,
      query.caseId,
      locale,
      texts,
      query.document,
      variants,
    );
    return { template: query.template, locale, ...rendered };
  }
}
