import type { MailCopyLocale } from "../../domain/mail-copy-locale.js";

/** Command : écrire le brouillon d'un texte d'e-mail, sur la révision que l'écran a lue. */
export class SaveMailCopyDraftCommand {
  constructor(
    readonly mail: string,
    readonly path: string,
    readonly locale: MailCopyLocale,
    readonly text: string,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
