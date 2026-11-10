import { REQUEST_PHOTO_BOUNDS } from "@lfd/contracts";
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Observable } from "rxjs";

import type { UploadedPhotoPart } from "../../shared/photo-cards/http/photo-card-http.js";
import { InvalidRequestPhotoError } from "../domain/errors/contact-errors.js";

/** Le champ multipart des photos d'un signalement. */
export const ORDER_PROBLEM_PHOTOS_FIELD = "photos";

/**
 * **Backstop DoS** : Multer coupe un fichier au-delà de la borne métier plus
 * un Mo, et refuse au-delà d'UN fichier de plus que la borne — ce fichier de
 * trop atteint le domaine, qui le refuse dans ses mots
 * (`TooManyRequestPhotosError`). En deçà, c'est `RequestPhoto` qui juge.
 */
const HARD_LIMIT_BYTES = REQUEST_PHOTO_BOUNDS.maxBytes + 1024 * 1024;
const HARD_LIMIT_FILES = REQUEST_PHOTO_BOUNDS.maxCount + 1;

const Multipart = FilesInterceptor(ORDER_PROBLEM_PHOTOS_FIELD, HARD_LIMIT_FILES, {
  limits: { fileSize: HARD_LIMIT_BYTES, files: HARD_LIMIT_FILES },
});

/**
 * L'intercepteur multipart des photos, dont la coupure de Multer (413 sans
 * code ni geste de sortie) est traduite en refus nommé — comme
 * `photoUpload` du socle. Multer n'ayant pas lu le reste, le refus ne cite
 * pas de poids inventé.
 */
@Injectable()
export class OrderProblemPhotosUpload implements NestInterceptor {
  private readonly multipart = new Multipart();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multipart.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new InvalidRequestPhotoError(
          `trop lourde ou trop nombreuses : ${String(REQUEST_PHOTO_BOUNDS.maxCount)} photos au plus, ` +
            "5 Mo chacune. Réduisez-les ou retirez-en avant d'envoyer.",
        );
      }
      throw error;
    }
  }
}

/** Les octets des fichiers joints, dans l'ordre ; `[]` sans fichier. */
export function photoBytesOf(files: readonly UploadedPhotoPart[] | undefined): readonly Buffer[] {
  return (files ?? []).map((file) => file.buffer);
}
