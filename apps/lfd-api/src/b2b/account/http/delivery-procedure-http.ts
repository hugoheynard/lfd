import { DELIVERY_STEP_PHOTO_MAX_BYTES } from "@lfd/contracts";
import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";

import type { DeliveryStepPhotoDownload } from "../application/queries/delivery-procedure-reading.js";

/**
 * Le transport partagé par les deux contrôleurs de procédure (client et staff) :
 * ils diffèrent par le mur et le préfixe, pas par la façon de lire un multipart
 * ou de servir une image.
 */

/**
 * **Backstop DoS du multipart : 2 Mo**, le double de la borne métier. Multer
 * coupe au-delà sans lire le reste ; entre 1 et 2 Mo, c'est le value object
 * `DeliveryStepPhoto` qui refuse, avec un message qui dit quoi faire.
 */
export const DELIVERY_STEP_UPLOAD_HARD_LIMIT = 2 * DELIVERY_STEP_PHOTO_MAX_BYTES;

/** Le peu qu'on lit du fichier Multer : ses octets — le domaine valide le reste. */
export interface UploadedPhotoPart {
  readonly buffer: Buffer;
}

/** Les octets de la photo jointe, ou `null` sans fichier. */
export function photoBytesOf(file: UploadedPhotoPart | undefined): Buffer | null {
  return file === undefined ? null : file.buffer;
}

/**
 * Pose les en-têtes d'une photo servie.
 *
 * - `Content-Type` relu dans les octets (jamais une colonne, jamais le client) ;
 * - `nosniff` : le navigateur ne réinterprète pas l'image en autre chose ;
 * - `private, immutable, 1 an` : l'URL côté écran porte `?rev=` et change à
 *   chaque dépôt, donc une réponse en cache n'est jamais périmée — et `private`
 *   la tient hors des caches partagés, c'est une photo de porte avec son code.
 */
export function servePhoto(res: Response, photo: DeliveryStepPhotoDownload): StreamableFile {
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return new StreamableFile(photo.bytes);
}
