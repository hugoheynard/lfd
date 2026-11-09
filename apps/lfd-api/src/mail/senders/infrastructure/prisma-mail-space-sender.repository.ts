import type { MailNature, MailSpace } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailSenderChangedError } from "../domain/mail-sender-errors.js";
import { MailSpaceSender } from "../domain/mail-space-sender.js";
import { MailSpaceSenderRepository } from "../domain/ports/mail-space-sender.repository.js";
import { toSenderColumns, toSenderState } from "./mail-sender-rows.js";

/**
 * Adaptateur Prisma de l'identité d'envoi d'un espace, dans le schéma `mail`.
 * Passe par le client ambiant : sous une unité de travail, il écrit dans la
 * transaction de l'appelant — celle qui fait aussi monter la version des
 * textes.
 *
 * Le verrou est en base, comme la charte : une ligne neuve s'écrit
 * `ON CONFLICT DO NOTHING`, une ligne existante sur `revision = chargée`.
 */
@Injectable()
export class PrismaMailSpaceSenderRepository extends MailSpaceSenderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(space: MailSpace, nature: MailNature): Promise<MailSpaceSender> {
    const row = await this.prisma.mailSenderIdentity.findUnique({
      where: { space_nature: { space, nature } },
    });
    return row === null
      ? MailSpaceSender.unset(space, nature)
      : MailSpaceSender.reconstitute(toSenderState(row));
  }

  async save(sender: MailSpaceSender): Promise<void> {
    const state = sender.snapshot();
    const columns = toSenderColumns(state);
    if (columns === null) {
      return;
    }
    const written =
      sender.loadedRevision === 0
        ? await this.prisma.mailSenderIdentity.createMany({
            data: [{ space: state.space, nature: state.nature, ...columns }],
            skipDuplicates: true,
          })
        : await this.prisma.mailSenderIdentity.updateMany({
            where: { space: state.space, nature: state.nature, revision: sender.loadedRevision },
            data: columns,
          });
    if (written.count === 0) {
      throw new MailSenderChangedError(state.space);
    }
  }
}
