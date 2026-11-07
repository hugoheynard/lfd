import { Inject, Injectable } from "@nestjs/common";
import { sniffContentType } from "@lfd/storage";

import { MailImageNotAnImageError } from "../domain/errors/mail-image.errors.js";
import { MailImageDownloader } from "../domain/ports/mail-image.downloader.js";
import { type MailImageCopy, MailImageStore } from "../domain/ports/mail-image.store.js";
import {
  MAIL_IMAGE_DOWNLOAD_TIMEOUT_MS,
  MAIL_IMAGE_MAX_BYTES,
  MAIL_IMAGE_TYPES,
  MailImageSource,
} from "../domain/value-objects/mail-image-source.js";
import { MAIL_IMAGE_ADMISSION, type MailImageAdmission } from "./mail-image-admission.js";

/**
 * **La copie d'une image de modèle** dans le stockage du bloc `mail` (plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`, § 23–24).
 *
 * Le seul contrat avec la médiathèque est une adresse web : le bloc ne
 * l'importe pas. Après la copie, plus aucune dépendance — la médiathèque peut
 * retirer l'image, aucun e-mail ne casse.
 *
 * Appelée à la publication d'un document d'e-mail (S5d,
 * `PublishMailDocumentHandler`, par le port `MailDocumentImages`), hors de
 * toute transaction.
 */
@Injectable()
export class MailImageCopier {
  constructor(
    @Inject(MAIL_IMAGE_ADMISSION) private readonly admission: MailImageAdmission,
    private readonly downloader: MailImageDownloader,
    private readonly store: MailImageStore,
  ) {}

  /**
   * Une adresse déjà sous l'adresse publique du bloc est une copie : elle est
   * rendue telle quelle, sans réseau — republier un document ne recopie rien.
   *
   * @throws {MailImageOriginNotAdmittedError} origine hors liste, ou pas `https`.
   * @throws {MailImageTooLargeError} au-delà de {@link MAIL_IMAGE_MAX_BYTES}.
   * @throws {MailImageNotAnImageError} les octets ne sont pas une image admise.
   */
  async copy(sourceUrl: string): Promise<MailImageCopy> {
    const own = this.admission.publicBaseUrl;
    if (own !== null && sourceUrl.startsWith(`${own}/`)) {
      return { url: sourceUrl };
    }
    const source = MailImageSource.admit(
      sourceUrl,
      this.admission.origins,
      this.admission.originsVariable,
    );
    const bytes = await this.downloader.download(source.url, {
      maxBytes: MAIL_IMAGE_MAX_BYTES,
      timeoutMs: MAIL_IMAGE_DOWNLOAD_TIMEOUT_MS,
    });
    // Le type se lit sur les octets, jamais sur l'en-tête annoncé par la source.
    const contentType = sniffContentType(bytes);
    if (contentType === null || !MAIL_IMAGE_TYPES.includes(contentType)) {
      throw new MailImageNotAnImageError(MAIL_IMAGE_TYPES);
    }
    return this.store.put(bytes, contentType);
  }
}
