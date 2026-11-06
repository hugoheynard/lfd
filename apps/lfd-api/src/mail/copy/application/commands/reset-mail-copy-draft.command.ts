import type { MailCopyLocale } from "../../domain/mail-copy-locale.js";

/** Command : rétablir le texte du code au prochain « Publier ». */
export class ResetMailCopyDraftCommand {
  constructor(
    readonly mail: string,
    readonly path: string,
    readonly locale: MailCopyLocale,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
