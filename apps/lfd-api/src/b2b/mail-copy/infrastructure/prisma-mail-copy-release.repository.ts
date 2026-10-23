import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailCopyReleaseRepository } from "../domain/ports/mail-copy-release.repository.js";
import { MailCopyEntry, type MailCopyStamp } from "../domain/mail-copy-entry.js";
import {
  MailCopyChangedError,
  MailCopyPublishedMeanwhileError,
} from "../domain/mail-copy-errors.js";
import { MailCopyRelease } from "../domain/mail-copy-release.js";
import { MAIL_COPY_PUBLICATION_KEY, toColumns, toStates } from "./mail-copy-rows.js";

/**
 * Adaptateur Prisma de « Publier ». Deux verrous, tous deux en base :
 *
 * - la **version** : posée sur `version = chargée` (ou créée si 0) — deux
 *   publications simultanées, la seconde n'écrit rien ;
 * - chaque **texte** : réécrit sur `revision = chargée` — un brouillon écrit
 *   pendant la publication n'est pas effacé par elle.
 */
@Injectable()
export class PrismaMailCopyReleaseRepository extends MailCopyReleaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<MailCopyRelease> {
    const [publication, rows] = await Promise.all([
      this.prisma.mailCopyPublication.findUnique({ where: { key: MAIL_COPY_PUBLICATION_KEY } }),
      this.prisma.mailCopyEntry.findMany({
        where: { draftState: { not: "unchanged" } },
        orderBy: [{ mail: "asc" }, { path: "asc" }, { locale: "asc" }],
      }),
    ]);
    const entries = toStates(rows).map((state) => MailCopyEntry.reconstitute(state));
    return MailCopyRelease.of(publication?.version ?? 0, entries);
  }

  async save(release: MailCopyRelease, stamp: MailCopyStamp): Promise<void> {
    await this.putVersion(release, stamp);
    for (const entry of release.entries) {
      const state = entry.snapshot();
      const written = await this.prisma.mailCopyEntry.updateMany({
        where: {
          mail: state.mail,
          path: state.path,
          locale: state.locale,
          revision: state.revision,
        },
        data: toColumns(state),
      });
      if (written.count === 0) {
        throw new MailCopyChangedError(state.mail, state.path, state.locale);
      }
    }
  }

  private async putVersion(release: MailCopyRelease, stamp: MailCopyStamp): Promise<void> {
    const row = { version: release.version, publishedAt: stamp.at, publishedBy: stamp.staffId };
    const written =
      release.expectedVersion === 0
        ? await this.prisma.mailCopyPublication.createMany({
            data: [{ key: MAIL_COPY_PUBLICATION_KEY, ...row }],
            skipDuplicates: true,
          })
        : await this.prisma.mailCopyPublication.updateMany({
            where: { key: MAIL_COPY_PUBLICATION_KEY, version: release.expectedVersion },
            data: row,
          });
    if (written.count === 0) {
      throw new MailCopyPublishedMeanwhileError();
    }
  }
}
