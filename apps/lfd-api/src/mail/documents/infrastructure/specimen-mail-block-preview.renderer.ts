import type { MailDocument, MailLocale, MailPreviewSituation } from "@lfd/mail-blocks";
import {
  htmlEscape,
  renderMailDocumentParts,
  type LayoutInput,
  type RenderedMail,
  type TemplateRegistry,
} from "@lfd/mailer";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { MailTextsByMail } from "../../copy/domain/mail-copy-texts.js";
import { withInlineImages } from "../../copy/infrastructure/specimen-mail-preview.renderer.js";
import { CachedPublishedMailCopyReader } from "../../copy/infrastructure/cached-published-mail-copy.reader.js";
import { resolvePublishedMailCharter } from "../../templates/effective-copy/published-mail-charter-resolution.js";
import { PublishedMailCopyReader } from "../../templates/effective-copy/published-mail-copy.reader.js";
import { withMailCharter } from "../../templates/sections/mail-charter-scope.js";
import { mailBrandingOf } from "../../templates/mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "../../templates/mail-templates.js";
import { documentRenderOptionsOf } from "../../templates/sections/mail-document-rendering.js";
import {
  revealEditorMarkers,
  type EditorMarkerContext,
} from "../../templates/sections/mail-editor-markers.js";
import type { MailEditorCapture } from "../../templates/sections/mail-layout-scope.js";
import { situatedDataOf } from "../../templates/specimens/cases/mail-situations.js";
import { mailCaseDataOf } from "../../templates/specimens/cases/mail-specimen-cases.js";
import { isMailKey, renderMailData } from "../../templates/specimens/mail-specimens.js";
import {
  MailTemplateWithoutLayoutError,
  UnknownMailCaseError,
  UnknownMailTemplateError,
} from "../domain/mail-document-errors.js";
import {
  MailBlockPreviewRenderer,
  type MailBlockPreviewRendering,
} from "../domain/ports/mail-block-preview.renderer.js";

/** Garde la PREMIÈRE entrée de la coquille que le gabarit pose. */
class FirstLayoutCapture implements MailEditorCapture {
  captured: LayoutInput | undefined;

  capture(input: LayoutInput): void {
    this.captured ??= input;
  }
}

/**
 * Adaptateur de l'aperçu par blocs (S5f) : le registre RÉEL, la même marque
 * que le mailer, les données du cas, et le périmètre de l'ÉDITEUR — phrases
 * et variables marquées, entrée de la coquille recueillie puis découpée par
 * `renderMailDocumentParts` (les fragments mêmes de l'envoi). Le rendu
 * complet du gabarit a lieu, comme pour l'aperçu fidèle : c'est lui qui
 * produit l'objet et les images. La charte publiée de l'espace s'y pose
 * comme à l'envoi (`withMailCharter`, § 25, C1) : le canevas reçoit des
 * fragments déjà aux couleurs de la charte.
 */
@Injectable()
export class SpecimenMailBlockPreviewRenderer extends MailBlockPreviewRenderer {
  private readonly registry: TemplateRegistry<B2bMails>;

  private readonly log = new Logger("MailEditorPreview");

  /**
   * @param published les chartes publiées, lues par le MÊME cache que
   *   l'envoi (`CachedPublishedMailCopyReader.charters()`).
   */
  constructor(
    config: AppConfig,
    @Inject(CachedPublishedMailCopyReader) private readonly published: PublishedMailCopyReader,
  ) {
    super();
    this.registry = b2bMailTemplates(mailBrandingOf(config));
  }

  async render(
    template: string,
    caseId: string,
    locale: MailLocale,
    texts: MailTextsByMail,
    document: MailDocument,
    variants: ReadonlyMap<string, string | null>,
    situation: MailPreviewSituation | null,
  ): Promise<MailBlockPreviewRendering> {
    if (!isMailKey(template)) {
      throw new UnknownMailTemplateError(template);
    }
    const found = mailCaseDataOf(template, caseId, locale);
    if (found === null) {
      throw new UnknownMailCaseError(template, caseId);
    }
    // § 24 : le cas passé en retrait ou en livraison. Le gabarit décide seul
    // de ce qu'il pose ; un bloc qu'il ne pose pas rend un fragment vide.
    const data =
      situation === null ? found : (situatedDataOf(template, found, situation, locale) ?? found);
    const charter = await resolvePublishedMailCharter(this.published, template, data, this.log);
    const capture = new FirstLayoutCapture();
    const rendered = withMailCharter(charter, () =>
      renderMailData(
        this.registry,
        template,
        data,
        { [locale]: texts },
        {
          orders: {},
          markers: false,
          documents: { [template]: { document, locale } },
          editor: capture,
        },
      ),
    );
    if (capture.captured === undefined) {
      throw new MailTemplateWithoutLayoutError(template);
    }
    const parts = renderMailDocumentParts(
      capture.captured,
      document,
      documentRenderOptionsOf(template, locale),
    );
    const context: EditorMarkerContext = { mail: template, variants };
    const shown = (html: string): string => revealEditorMarkers(inlined(rendered, html), context);
    return {
      subject: revealEditorMarkers(htmlEscape(rendered.subject), context),
      header: shown(parts.header),
      footer: shown(parts.footer),
      blocks: parts.blocks.map((block) => ({ blockId: block.blockId, html: shown(block.html) })),
    };
  }
}

/** Un fragment, ses `cid:` remplacés par les images que l'e-mail joint. */
function inlined(rendered: RenderedMail, html: string): string {
  return withInlineImages({ ...rendered, html });
}
