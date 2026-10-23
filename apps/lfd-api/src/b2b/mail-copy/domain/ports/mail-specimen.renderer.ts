import type { MailCopyLocale } from "../mail-copy-locale.js";
import type { MailTextsByMail } from "../mail-copy-texts.js";

/** Une pièce jointe de l'aperçu : on la nomme, on ne la sert pas. */
export interface MailSpecimenAttachment {
  readonly filename: string;
  readonly contentType: string | null;
  /** Une image du corps (`cid:`), déjà incrustée dans le HTML de l'aperçu. */
  readonly inline: boolean;
}

/** Un e-mail d'exemple rendu, prêt à montrer. */
export interface MailSpecimenRendering {
  readonly subject: string;
  /** Le HTML tel qu'il partirait — images du corps incrustées pour être vues. */
  readonly html: string;
  readonly attachments: readonly MailSpecimenAttachment[];
}

/**
 * Port de **l'aperçu** (C6) : le VRAI gabarit d'un e-mail, rendu avec ses
 * données d'exemple et ces textes à la place de ceux du code. N'écrit rien,
 * n'envoie rien.
 */
export abstract class MailSpecimenRenderer {
  /** @throws {UnknownMailError} l'e-mail n'est pas au registre. */
  abstract render(
    mail: string,
    locale: MailCopyLocale,
    texts: MailTextsByMail,
  ): MailSpecimenRendering;
}

/**
 * Port de **l'essai** (C6) : envoie l'exemple d'un e-mail, rendu avec ces
 * textes, à UNE adresse. Un port distinct de l'aperçu (ISP) : rendre et
 * envoyer sont deux gestes, et le second seul a un effet hors de l'API.
 */
export abstract class MailTrialSender {
  /** @throws {UnknownMailError} l'e-mail n'est pas au registre. */
  abstract send(
    to: string,
    mail: string,
    locale: MailCopyLocale,
    texts: MailTextsByMail,
  ): Promise<void>;
}
