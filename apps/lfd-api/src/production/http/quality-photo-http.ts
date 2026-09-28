import { QUALITY_PHOTO_MAX_BYTES } from "@lfd/contracts";
import { type NestInterceptor, StreamableFile, type Type } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { StoredDocument } from "../../platform/storage/document-store.js";

/**
 * Le transport des photos de contrôle : lire un multipart, servir une image.
 *
 * Réécrit ici plutôt qu'emprunté aux cartes à photo (`b2b/shared/photo-cards`),
 * que la production n'a pas le droit d'importer (`CLAUDE.md` §3, plan
 * `plan-controle-qualite.md`, D8). Même mécanique, bornes à elle.
 */

/** Le champ multipart qui porte la photo. */
const PHOTO_FIELD = "photo";

/**
 * **Backstop DoS : 20 Mo**, le double de la borne métier. Multer coupe au-delà
 * sans lire le reste (413) ; en deçà, c'est `QualityPhoto` qui refuse, avec un
 * message qui dit quoi faire.
 */
const QUALITY_UPLOAD_HARD_LIMIT = 2 * QUALITY_PHOTO_MAX_BYTES;

/** Le peu qu'on lit du fichier Multer : ses octets — le domaine valide le reste. */
export interface UploadedQualityPhoto {
  readonly buffer: Buffer;
}

export function qualityPhotoUpload(): Type<NestInterceptor> {
  return FileInterceptor(PHOTO_FIELD, { limits: { fileSize: QUALITY_UPLOAD_HARD_LIMIT } });
}

/** Ce que `serveQualityPhoto` touche de la réponse : ses en-têtes. */
export interface PhotoResponseHeaders {
  setHeader(name: string, value: string): unknown;
}

/**
 * `Content-Type` relu au dépôt, `nosniff`, et `private` : une photo de contrôle
 * ne va dans aucun cache partagé. Immuable : une photo rattachée ne change
 * jamais sous sa clé (un contrôle n'est jamais réécrit).
 */
export function serveQualityPhoto(
  res: PhotoResponseHeaders,
  photo: StoredDocument,
): StreamableFile {
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return new StreamableFile(photo.bytes);
}
