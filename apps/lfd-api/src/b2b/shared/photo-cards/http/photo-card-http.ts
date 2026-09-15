import { StreamableFile, type Type, type NestInterceptor } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { StoredDocument } from "../../../../platform/storage/document-store.js";

/**
 * Le transport commun des cartes à photo : lire un multipart, servir une image.
 * Les contrôleurs de chaque usage diffèrent par leurs chemins, leur surface et
 * leur permission — pas par la façon de recevoir ou de rendre une photo.
 */

/** Le champ multipart qui porte la photo, pour tous les usages. */
const PHOTO_FIELD = "photo";

/** Le peu qu'on lit du fichier Multer : ses octets — le domaine valide le reste. */
export interface UploadedPhotoPart {
  readonly buffer: Buffer;
}

/**
 * L'intercepteur multipart du champ `photo`, coupé à `hardLimitBytes`.
 *
 * C'est un **backstop DoS**, pas la borne métier : Multer coupe au-delà sans
 * lire le reste (413 « File too large ») ; en deçà, c'est le value object de
 * l'usage qui refuse, avec un message qui dit quoi faire. L'usage choisit donc
 * une limite AU-DESSUS de sa borne métier.
 */
export function photoUpload(hardLimitBytes: number): Type<NestInterceptor> {
  return FileInterceptor(PHOTO_FIELD, { limits: { fileSize: hardLimitBytes } });
}

/** Les octets de la photo jointe, ou `null` sans fichier. */
export function photoBytesOf(file: UploadedPhotoPart | undefined): Buffer | null {
  return file === undefined ? null : file.buffer;
}

/** Ce que `servePhoto` touche de la réponse : ses en-têtes, rien d'autre. */
export interface PhotoResponseHeaders {
  setHeader(name: string, value: string): unknown;
}

/**
 * Pose les en-têtes d'une photo servie.
 *
 * - `Content-Type` relu dans les octets (jamais une colonne, jamais le client) ;
 * - `nosniff` : le navigateur ne réinterprète pas l'image en autre chose ;
 * - `private, immutable, 1 an` : l'URL côté écran porte `?rev=` et change à
 *   chaque dépôt, donc une réponse en cache n'est jamais périmée — et `private`
 *   la tient hors des caches partagés : une photo de porte avec son code, une
 *   note de commercial.
 */
export function servePhoto(res: PhotoResponseHeaders, photo: StoredDocument): StreamableFile {
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return new StreamableFile(photo.bytes);
}
