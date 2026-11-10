import { DELIVERY_STEP_PHOTO_MAX_BYTES } from "@lfd/contracts";
import type { NestInterceptor, Type } from "@nestjs/common";

import { megabytes } from "../../shared/photo-cards/domain/value-objects/card-photo.js";
import { photoUpload } from "../../shared/photo-cards/http/photo-card-http.js";
import { InvalidDeliveryStepPhotoError } from "../domain/errors/delivery-procedure-errors.js";
import { DELIVERY_STEP_PHOTO_MAX_BYTES as STEP_PHOTO_LIMIT } from "../domain/value-objects/delivery-step-photo.js";

/**
 * Ce que le transport de la procédure a de propre. Le reste — lire le
 * multipart, servir l'image — est celui du socle des cartes à photo
 * (`shared/photo-cards/http/photo-card-http.ts`), partagé avec les notes.
 */

/**
 * **Backstop DoS du multipart : 2 Mo**, le double de la borne métier. Multer
 * coupe au-delà sans lire le reste ; entre 1 et 2 Mo, c'est le value object
 * `DeliveryStepPhoto` qui refuse, avec un message qui dit quoi faire.
 */
export const DELIVERY_STEP_UPLOAD_HARD_LIMIT = 2 * DELIVERY_STEP_PHOTO_MAX_BYTES;

/**
 * Le multipart d'une étape. Au-delà du backstop, le refus est celui de la
 * photo d'étape (même code, 400) et non plus le 413 brut de Multer : même
 * cause qu'entre 1 et 2 Mo, même geste de sortie. Le poids exact n'est pas lu.
 */
export function deliveryStepPhotoUpload(): Type<NestInterceptor> {
  return photoUpload(
    DELIVERY_STEP_UPLOAD_HARD_LIMIT,
    () =>
      new InvalidDeliveryStepPhotoError(
        `elle pèse plus de ${megabytes(DELIVERY_STEP_UPLOAD_HARD_LIMIT)} Mo, la limite est de ` +
          `${megabytes(STEP_PHOTO_LIMIT)} Mo. Reprenez-la depuis l'écran de la procédure, ` +
          "qui la réduit avant l'envoi.",
      ),
  );
}
