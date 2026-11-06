import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailCopyRepository } from "../domain/ports/mail-copy.repository.js";
import { MailCopyEntry } from "../domain/mail-copy-entry.js";
import { MailCopyChangedError } from "../domain/mail-copy-errors.js";
import type { MailCopyLocale } from "../domain/mail-copy-locale.js";
import { toColumns, toState } from "./mail-copy-rows.js";

/**
 * Adaptateur Prisma d'un texte d'e-mail. L'écriture est conditionnée à la
 * révision chargée, en un seul ordre SQL par cas — comme les textes de la
 * boutique :
 *
 * - révision chargée 0 : la ligne n'existait pas ; `createMany` +
 *   `skipDuplicates` n'insère rien si un collègue l'a créée entre-temps ;
 * - sinon : `updateMany` sur `revision = chargée`.
 */
@Injectable()
export class PrismaMailCopyRepository extends MailCopyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(mail: string, path: string, locale: MailCopyLocale): Promise<MailCopyEntry> {
    const row = await this.prisma.mailCopyEntry.findUnique({
      where: { mail_path_locale: { mail, path, locale } },
    });
    const state = row === null ? null : toState(row);
    return state === null
      ? MailCopyEntry.untouched(mail, path, locale)
      : MailCopyEntry.reconstitute(state);
  }

  async save(entry: MailCopyEntry): Promise<void> {
    const state = entry.snapshot();
    const loaded = state.revision - 1;
    const columns = toColumns(state);
    const written =
      loaded === 0
        ? await this.prisma.mailCopyEntry.createMany({
            data: [{ mail: state.mail, path: state.path, locale: state.locale, ...columns }],
            skipDuplicates: true,
          })
        : await this.prisma.mailCopyEntry.updateMany({
            where: { mail: state.mail, path: state.path, locale: state.locale, revision: loaded },
            data: columns,
          });
    if (written.count === 0) {
      throw new MailCopyChangedError(state.mail, state.path, state.locale);
    }
  }
}
