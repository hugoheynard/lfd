import { CLIENT_NOTE_PHOTO_MAX_BYTES } from "@lfd/contracts";
import type { NestInterceptor, Type } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";

import type { UploadedPhotoPart } from "../../shared/photo-cards/http/photo-card-http.js";

/**
 * Ce que le transport des notes a de propre : DEUX fichiers par envoi, la photo
 * lisible et sa vignette. Servir une image reste `servePhoto` du socle.
 *
 * Pas dans le socle : la vignette est propre aux notes, les étapes de livraison
 * n'en ont pas (plan `documentation/b2b/plan-notes-photo-du-commercial.md`, D7 bis).
 */

/**
 * **Backstop DoS du multipart : 1,2 Mo par fichier**, le double de la borne
 * métier de la photo. Multer coupe au-delà sans lire le reste (413) ; en deçà,
 * c'est `ClientNotePhoto` qui refuse, avec un message qui dit quoi faire — y
 * compris pour une vignette de plus de 60 Ko.
 */
export const CLIENT_NOTE_UPLOAD_HARD_LIMIT = 2 * CLIENT_NOTE_PHOTO_MAX_BYTES;

/** Les fichiers joints, tels que Multer les range par champ. */
export interface UploadedNoteImages {
  readonly photo?: readonly UploadedPhotoPart[];
  readonly thumbnail?: readonly UploadedPhotoPart[];
}

/** L'intercepteur multipart des champs `photo` et `thumbnail`, un fichier chacun. */
export function noteImagesUpload(): Type<NestInterceptor> {
  return FileFieldsInterceptor(
    [
      { name: "photo", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ],
    { limits: { fileSize: CLIENT_NOTE_UPLOAD_HARD_LIMIT } },
  );
}

/** Les octets d'un champ, ou `null` sans fichier — le domaine valide le reste. */
export function noteImageBytes(
  files: UploadedNoteImages | undefined,
  field: keyof UploadedNoteImages,
): Buffer | null {
  return files?.[field]?.[0]?.buffer ?? null;
}
