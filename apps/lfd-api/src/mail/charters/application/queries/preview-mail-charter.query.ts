import type { MailCharterSettings, MailLocale } from "@lfd/mail-blocks";

/**
 * Query : un e-mail de l'espace rendu avec une charte — celle de l'écran,
 * sinon celle qu'il ouvrirait. `template` : sans lui, le premier e-mail de
 * l'espace. Rien n'est écrit, rien n'est copié.
 */
export class PreviewMailCharterQuery {
  constructor(
    readonly space: string,
    readonly template: string | null,
    readonly locale: MailLocale,
    readonly settings: MailCharterSettings | null,
  ) {}
}
