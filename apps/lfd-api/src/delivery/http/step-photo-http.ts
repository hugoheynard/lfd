import { StreamableFile } from "@nestjs/common";

import type { StoredDocument } from "../../platform/storage/document-store.js";

/** Ce que `serveStepPhoto` touche de la réponse : ses en-têtes. */
export interface StepPhotoResponseHeaders {
  setHeader(name: string, value: string): unknown;
}

/**
 * Les en-têtes de la photo d'une étape servie au livreur — les MÊMES que la
 * route du staff (`b2b/shared/photo-cards/http/photo-card-http.ts`,
 * `servePhoto`), recopiés parce que `delivery → b2b` est interdit (même
 * geste que `production/http/quality-photo-http.ts`, vérifié le 2026-10-01).
 *
 * `Content-Type` relu dans les octets, `nosniff`, et `private, immutable` :
 * l'URL de l'écran porte `?rev=` (la `photoRevision` de la vue), qui change à
 * chaque dépôt ; `private` tient une photo de porte avec son code hors des
 * caches partagés.
 */
export function serveStepPhoto(
  res: StepPhotoResponseHeaders,
  photo: StoredDocument,
): StreamableFile {
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return new StreamableFile(photo.bytes);
}
