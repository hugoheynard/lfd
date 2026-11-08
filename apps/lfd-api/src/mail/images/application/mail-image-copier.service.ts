import { Inject, Injectable } from "@nestjs/common";
import type { ImageShaping } from "@lfd/mail-blocks";
import { sniffContentType } from "@lfd/storage";

import { MailImageNotAnImageError } from "../domain/errors/mail-image.errors.js";
import { MailImageDownloader } from "../domain/ports/mail-image.downloader.js";
import { MailImageReframer } from "../domain/ports/mail-image.reframer.js";
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
 * `documentation/mail/plan-service-e-mails.md`, § 23–24).
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
    private readonly reframer: MailImageReframer,
  ) {}

  /**
   * Une adresse déjà sous l'adresse publique du bloc est une copie : elle est
   * rendue telle quelle, sans réseau — republier un document ne recopie rien.
   *
   * `shaping` (§ 19, « Format et point focal » ; largeur, 2026-11-08) : la
   * copie est recadrée au format autour du point focal s'il y en a un, et
   * ramenée à `maxWidthPx` de large au plus — deux fois la largeur affichée,
   * jamais agrandie —, réencodée dans le même type. Le stockage étant adressé
   * par le contenu, deux cadrages ou deux largeurs font deux copies. `null`
   * (le logo d'une charte) : les octets d'origine, tels quels.
   *
   * @throws {MailImageOriginNotAdmittedError} origine hors liste, ou pas `https`.
   * @throws {MailImageTooLargeError} au-delà de {@link MAIL_IMAGE_MAX_BYTES}.
   * @throws {MailImageNotAnImageError} les octets ne sont pas une image admise.
   * @throws {MailImageUnreadableError} l'image à recadrer ne se décode pas.
   */
  async copy(sourceUrl: string, shaping: ImageShaping | null = null): Promise<MailImageCopy> {
    const own = this.admission.copiesBaseUrl;
    if (own !== null && sourceUrl.startsWith(`${own}/`)) {
      return { url: sourceUrl };
    }
    const source = MailImageSource.admit(sourceUrl, this.admission.origins);
    const bytes = await this.downloader.download(source.url, {
      maxBytes: MAIL_IMAGE_MAX_BYTES,
      timeoutMs: MAIL_IMAGE_DOWNLOAD_TIMEOUT_MS,
    });
    // Le type se lit sur les octets, jamais sur l'en-tête annoncé par la source.
    const contentType = sniffContentType(bytes);
    if (contentType === null || !MAIL_IMAGE_TYPES.includes(contentType)) {
      throw new MailImageNotAnImageError(MAIL_IMAGE_TYPES);
    }
    const copied =
      shaping === null ? bytes : await this.reframer.reframe(bytes, contentType, shaping);
    return this.store.put(copied, contentType);
  }
}
