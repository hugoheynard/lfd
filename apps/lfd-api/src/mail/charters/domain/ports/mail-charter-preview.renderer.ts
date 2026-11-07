import type { MailCharterSettings, MailLocale } from "@lfd/mail-blocks";

/** Un e-mail rendu pour l'aperçu de la charte. */
export interface MailCharterPreview {
  readonly subject: string;
  readonly html: string;
}

/**
 * Port de **l'aperçu d'une charte** (plan `plan-editeur-par-blocs.md`, § 25) :
 * l'exemple d'un e-mail de l'espace, rendu avec ces réglages au lieu de la
 * charte publiée. Rien n'est écrit, rien n'est copié : le logo s'y montre à
 * son adresse d'origine.
 */
export abstract class MailCharterPreviewRenderer {
  abstract render(
    template: string,
    locale: MailLocale,
    settings: MailCharterSettings,
  ): Promise<MailCharterPreview>;
}
