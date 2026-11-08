import { Module } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import {
  MAIL_IMAGE_ADMISSION,
  type MailImageAdmission,
} from "./application/mail-image-admission.js";
import { MailImageCopier } from "./application/mail-image-copier.service.js";
import { MailImageDownloader } from "./domain/ports/mail-image.downloader.js";
import { MailImageReframer } from "./domain/ports/mail-image.reframer.js";
import { MailImageStore } from "./domain/ports/mail-image.store.js";
import { FetchMailImageDownloader } from "./infrastructure/fetch-mail-image.downloader.js";
import { MAIL_COPIES_ROOT, R2MailImageStore } from "./infrastructure/r2-mail-image.store.js";
import { SharpMailImageReframer } from "./infrastructure/sharp-mail-image.reframer.js";

/** Où vivent les copies du bloc : le dossier `mail/` du bucket des médias. */
function copiesBaseUrlOf(mediaBaseUrl: string | null): string | null {
  return mediaBaseUrl === null ? null : `${mediaBaseUrl}/${MAIL_COPIES_ROOT}`;
}

/**
 * **Les images des modèles d'e-mail** (plan du service d'e-mails, §§ 23–24) :
 * la copie dans le stockage du bloc, que la publication d'un document appelle
 * (S5d). Sorti de `MailModule` le 2026-11-07 pour être importé par
 * `MailDocumentsModule`, son seul consommateur.
 */
@Module({
  providers: [
    {
      provide: MAIL_IMAGE_ADMISSION,
      useFactory: (config: AppConfig): MailImageAdmission => ({
        origins: config.mailImageOrigins(),
        copiesBaseUrl: copiesBaseUrlOf(config.mediaPublicBaseUrl()),
      }),
      inject: [AppConfig],
    },
    { provide: MailImageDownloader, useClass: FetchMailImageDownloader },
    { provide: MailImageStore, useClass: R2MailImageStore },
    { provide: MailImageReframer, useClass: SharpMailImageReframer },
    MailImageCopier,
  ],
  exports: [MailImageCopier],
})
export class MailImagesModule {}
