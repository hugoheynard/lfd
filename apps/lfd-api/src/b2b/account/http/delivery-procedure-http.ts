import { DELIVERY_STEP_PHOTO_MAX_BYTES } from "@lfd/contracts";

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
