import type { MailCopyLocale, MailCopySource } from "../../domain/mail-copy-locale.js";

/** Command : « M'envoyer un essai » — l'aperçu d'un e-mail, à la seule adresse de l'appelant (C6). */
export class SendMailCopyTrialCommand {
  constructor(
    readonly mail: string,
    readonly locale: MailCopyLocale,
    readonly source: MailCopySource,
    readonly staffUserId: string,
  ) {}
}
