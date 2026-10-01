import type { NestInterceptor, Type } from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";

import { INCIDENT_PHOTO_MAX_BYTES } from "../domain/value-objects/incident-photo.js";

/**
 * Le transport de la photo d'un signalement (`plan-a-la-porte.md`, § 3) :
 * lire un multipart. La servir reprend `serveStepPhoto` — mêmes en-têtes, et
 * une photo de signalement ne change jamais sous sa clé.
 *
 * Réécrit ici plutôt qu'emprunté aux cartes à photo (`b2b/shared/photo-cards`) :
 * `delivery → b2b` est interdit (même geste que `quality-photo-http.ts`).
 */

/** Le champ multipart qui porte la photo. */
const PHOTO_FIELD = "photo";

/**
 * **Backstop DoS**, le double de la borne métier : Multer coupe au-delà sans
 * lire le reste (413) ; en deçà, c'est `IncidentPhoto` qui refuse avec ses mots.
 */
const INCIDENT_UPLOAD_HARD_LIMIT = 2 * INCIDENT_PHOTO_MAX_BYTES;

/** Le peu qu'on lit du fichier Multer : ses octets — le domaine valide le reste. */
export interface UploadedIncidentPhoto {
  readonly buffer: Buffer;
}

export function incidentPhotoUpload(): Type<NestInterceptor> {
  return FileInterceptor(PHOTO_FIELD, { limits: { fileSize: INCIDENT_UPLOAD_HARD_LIMIT } });
}

/** Les deux images d'une remise (`plan-a-la-porte.md`, B1) : la photo, la signature. */
const HANDOVER_PHOTO_FIELD = "photo";
const HANDOVER_SIGNATURE_FIELD = "signature";

/** Ce que Multer rend pour une remise : au plus une image par champ. */
export interface UploadedHandoverPictures {
  readonly photo?: readonly UploadedIncidentPhoto[];
  readonly signature?: readonly UploadedIncidentPhoto[];
}

/** La même borne que la photo d'un signalement : le téléphone est le même. */
export function handoverPicturesUpload(): Type<NestInterceptor> {
  return FileFieldsInterceptor(
    [
      { name: HANDOVER_PHOTO_FIELD, maxCount: 1 },
      { name: HANDOVER_SIGNATURE_FIELD, maxCount: 1 },
    ],
    { limits: { fileSize: INCIDENT_UPLOAD_HARD_LIMIT } },
  );
}
