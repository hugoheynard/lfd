import type { VitrineNoticePreviewView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineNoticeMailRenderer } from "../../domain/ports/vitrine-notice-mail.renderer.js";
import { VitrineNoticeReader } from "../../domain/ports/vitrine-notice.reader.js";
import { selectVitrineNoticeAddressees } from "../../domain/vitrine-notice-audience.js";
import { VitrineNoticeText } from "../../domain/vitrine-notice-text.js";
import { PreviewVitrineNoticeQuery } from "./preview-vitrine-notice.query.js";

/**
 * Rend l'annonce par le gabarit de l'envoi et retient ses destinataires par
 * la même règle que l'envoi : ce qui est relu, et refusé, est ce qui partira.
 */
@QueryHandler(PreviewVitrineNoticeQuery)
export class PreviewVitrineNoticeHandler implements IQueryHandler<
  PreviewVitrineNoticeQuery,
  VitrineNoticePreviewView
> {
  constructor(
    private readonly reader: VitrineNoticeReader,
    private readonly renderer: VitrineNoticeMailRenderer,
  ) {}

  async execute(query: PreviewVitrineNoticeQuery): Promise<VitrineNoticePreviewView> {
    const text = VitrineNoticeText.of(query.subject, query.message);
    const recipients = selectVitrineNoticeAddressees(
      await this.reader.candidates(),
      query.subscriberIds,
    );
    return { ...this.renderer.render(text), recipients };
  }
}
