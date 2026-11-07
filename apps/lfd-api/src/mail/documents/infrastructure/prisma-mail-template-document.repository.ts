import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailDocumentChangedError } from "../domain/mail-document-errors.js";
import { MailTemplateDocument } from "../domain/mail-template-document.js";
import { MailTemplateDocumentRepository } from "../domain/ports/mail-template-document.repository.js";
import { mailDocumentJson, toDocumentColumns, toDocumentState } from "./mail-document-rows.js";

/**
 * Adaptateur Prisma du document d'un e-mail, dans le schéma `mail`. Passe par
 * le client ambiant : sous une unité de travail, il écrit dans la transaction
 * de l'appelant — celle qui publie aussi les phrases.
 *
 * Le verrou est en base : une ligne neuve s'écrit `ON CONFLICT DO NOTHING`,
 * une ligne existante sur `revision = chargée`. Deux rédacteurs, le second
 * n'écrit rien et le dit.
 */
@Injectable()
export class PrismaMailTemplateDocumentRepository extends MailTemplateDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(template: string): Promise<MailTemplateDocument> {
    const row = await this.prisma.mailDocument.findUnique({ where: { template } });
    return row === null
      ? MailTemplateDocument.untouched(template)
      : MailTemplateDocument.reconstitute(toDocumentState(row));
  }

  async save(document: MailTemplateDocument): Promise<void> {
    const state = document.snapshot();
    const columns = toDocumentColumns(state);
    const written =
      document.loadedRevision === 0
        ? await this.prisma.mailDocument.createMany({
            data: [{ template: state.template, ...columns }],
            skipDuplicates: true,
          })
        : await this.prisma.mailDocument.updateMany({
            where: { template: state.template, revision: document.loadedRevision },
            data: columns,
          });
    if (written.count === 0) {
      throw new MailDocumentChangedError(state.template);
    }
    const appended = document.appendedVersion;
    if (appended !== null) {
      // Ajout seul : un déclencheur refuse UPDATE et DELETE sur cette table.
      await this.prisma.mailDocumentVersion.create({
        data: {
          template: state.template,
          version: appended.version,
          document: mailDocumentJson(appended.document),
          publishedAt: appended.stamp.at,
          publishedBy: appended.stamp.staffId,
        },
      });
    }
  }
}
