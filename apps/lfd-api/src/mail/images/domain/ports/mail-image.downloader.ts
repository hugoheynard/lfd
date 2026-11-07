/** Les bornes d'un téléchargement : au-delà, on abandonne. */
export interface DownloadLimits {
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

/**
 * Port du **téléchargement** d'une image à copier (§ 24 du plan du service
 * d'e-mails). Il ne choisit pas où il va : l'adresse a déjà été admise par
 * {@link MailImageSource}.
 *
 * @returns les octets, jamais plus que `maxBytes`.
 * @throws {MailImageTooLargeError} l'image dépasse `maxBytes`.
 * @throws {MailImageDownloadFailedError} réponse non 2xx, redirection, délai, réseau.
 */
export abstract class MailImageDownloader {
  abstract download(url: URL, limits: DownloadLimits): Promise<Buffer>;
}
