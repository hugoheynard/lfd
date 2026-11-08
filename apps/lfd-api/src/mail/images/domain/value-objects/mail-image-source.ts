import {
  InvalidMailImageUrlError,
  MailImageOriginNotAdmittedError,
} from "../errors/mail-image.errors.js";

/**
 * Les bornes d'une copie d'image. Un logo ou une bannière d'e-mail pèse
 * quelques centaines de Kio ; 5 Mio laisse la marge sans laisser télécharger
 * n'importe quoi.
 */
export const MAIL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Au-delà, la source est en panne : on n'attend pas plus longtemps. */
export const MAIL_IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * Les types admis, reconnus par les OCTETS : ceux que les messageries
 * affichent et que la médiathèque range. Pas de SVG : la plupart des
 * messageries ne l'affichent pas, et il porte du script.
 */
export const MAIL_IMAGE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/**
 * Une adresse d'image **admise à la copie** (plan du service d'e-mails, § 23) :
 * de l'origine de la médiathèque — `https`, ou la boucle locale en dev
 * (`AppConfig.mailImageOrigins`). Rien d'autre ne se télécharge.
 */
export class MailImageSource {
  private constructor(readonly url: URL) {}

  static admit(raw: string, admittedOrigins: readonly string[]): MailImageSource {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new InvalidMailImageUrlError(raw);
    }
    // `URL.origin` vaut "null" hors http(s) : il ne figure jamais dans la liste.
    // Le clair ne passe que si son origine exacte y est — en boucle locale.
    if (!admittedOrigins.includes(url.origin)) {
      throw new MailImageOriginNotAdmittedError(
        url.protocol === "https:" || url.protocol === "http:" ? url.origin : url.protocol,
      );
    }
    if (url.username !== "" || url.password !== "") {
      // Jamais l'adresse brute dans le message : elle porte un secret.
      throw new InvalidMailImageUrlError(`${url.origin}${url.pathname}`);
    }
    return new MailImageSource(url);
  }

  get origin(): string {
    return this.url.origin;
  }
}
