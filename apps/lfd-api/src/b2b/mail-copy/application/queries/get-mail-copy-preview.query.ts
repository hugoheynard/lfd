import type { MailCopyLocale, MailCopySource } from "../../domain/mail-copy-locale.js";

/** Query : l'aperçu d'un e-mail, rendu par son vrai gabarit avec des données d'exemple (C6). */
export class GetMailCopyPreviewQuery {
  constructor(
    readonly mail: string,
    readonly locale: MailCopyLocale,
    readonly source: MailCopySource,
  ) {}
}
