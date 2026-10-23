import type { MailCopyPreviewView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailCopyAdminReader } from "../../domain/ports/mail-copy-admin.reader.js";
import { MailSpecimenRenderer } from "../../domain/ports/mail-specimen.renderer.js";
import { UnknownMailError } from "../../domain/mail-copy-errors.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { replacementTexts } from "../../domain/mail-copy-texts.js";
import { replacementSectionOrders } from "../../domain/mail-section-orders.js";
import { GetMailCopyPreviewQuery } from "./get-mail-copy-preview.query.js";

/**
 * L'aperçu d'un e-mail (C6) : les textes et l'ordre des sections (E4) de la
 * source demandée — brouillons ou publié —, appliqués à son VRAI gabarit, sur
 * des données d'exemple. Une
 * lecture : rien n'est écrit, rien n'est envoyé.
 */
@QueryHandler(GetMailCopyPreviewQuery)
export class GetMailCopyPreviewHandler implements IQueryHandler<
  GetMailCopyPreviewQuery,
  MailCopyPreviewView
> {
  constructor(
    private readonly reader: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
    private readonly renderer: MailSpecimenRenderer,
  ) {}

  /** @throws {UnknownMailError} l'e-mail n'est pas au registre. */
  async execute(query: GetMailCopyPreviewQuery): Promise<MailCopyPreviewView> {
    if (!this.manifest.hasMail(query.mail)) {
      throw new UnknownMailError(query.mail);
    }
    const [states, orders] = await Promise.all([
      this.reader.entries(),
      this.reader.sectionOrders(),
    ]);
    const texts = replacementTexts(states, this.manifest, query.locale, query.source);
    const order = replacementSectionOrders(orders, this.manifest, query.source)[query.mail] ?? null;
    const rendered = this.renderer.render(query.mail, query.locale, texts, order);
    return { mail: query.mail, locale: query.locale, source: query.source, ...rendered };
  }
}
