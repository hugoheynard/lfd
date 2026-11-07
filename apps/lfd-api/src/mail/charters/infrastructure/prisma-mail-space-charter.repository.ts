import type { MailSpace } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailCharterChangedError } from "../domain/mail-charter-errors.js";
import { MailSpaceCharter } from "../domain/mail-space-charter.js";
import { MailSpaceCharterRepository } from "../domain/ports/mail-space-charter.repository.js";
import { charterSettingsJson, toCharterColumns, toCharterState } from "./mail-charter-rows.js";

/**
 * Adaptateur Prisma de la charte d'un espace, dans le schéma `mail`. Passe
 * par le client ambiant : sous une unité de travail, il écrit dans la
 * transaction de l'appelant — celle qui fait aussi monter la version des
 * textes.
 *
 * Le verrou est en base : une ligne neuve s'écrit `ON CONFLICT DO NOTHING`,
 * une ligne existante sur `revision = chargée`. Deux rédacteurs, le second
 * n'écrit rien et le dit.
 */
@Injectable()
export class PrismaMailSpaceCharterRepository extends MailSpaceCharterRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(space: MailSpace): Promise<MailSpaceCharter> {
    const row = await this.prisma.mailCharter.findUnique({ where: { space } });
    return row === null
      ? MailSpaceCharter.untouched(space)
      : MailSpaceCharter.reconstitute(toCharterState(row));
  }

  async save(charter: MailSpaceCharter): Promise<void> {
    const state = charter.snapshot();
    const columns = toCharterColumns(state);
    const written =
      charter.loadedRevision === 0
        ? await this.prisma.mailCharter.createMany({
            data: [{ space: state.space, ...columns }],
            skipDuplicates: true,
          })
        : await this.prisma.mailCharter.updateMany({
            where: { space: state.space, revision: charter.loadedRevision },
            data: columns,
          });
    if (written.count === 0) {
      throw new MailCharterChangedError(state.space);
    }
    const appended = charter.appendedVersion;
    if (appended !== null) {
      // Ajout seul : un déclencheur refuse UPDATE et DELETE sur cette table.
      await this.prisma.mailCharterVersion.create({
        data: {
          space: state.space,
          version: appended.version,
          settings: charterSettingsJson(appended.settings),
          publishedAt: appended.stamp.at,
          publishedBy: appended.stamp.staffId,
        },
      });
    }
  }
}
