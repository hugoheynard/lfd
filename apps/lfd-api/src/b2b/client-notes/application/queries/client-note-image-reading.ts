import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  ClientNotePhotoNotFoundError,
  ClientNotePhotoUnreadableError,
} from "../../domain/errors/client-notebook-errors.js";
import type { ClientNotePhotoLocator } from "../../domain/ports/client-note-photo.locator.js";
import { clientNoteImageContentType } from "../../domain/value-objects/client-note-photo.js";

/** Quelle image de la paire on sert, à partir de la clé de la photo lisible. */
export type NoteImageKey = (photoKey: string) => string;

/** La photo lisible : sa clé est celle que la note porte. */
export const READABLE_PHOTO: NoteImageKey = (photoKey) => photoKey;

/**
 * Relit une image d'une note — la photo lisible ou sa vignette —, sous le mur de
 * la société : le localisateur ne trouve pas la note d'un autre carnet.
 *
 * Le type est relu dans les octets plutôt que gardé en colonne.
 *
 * @throws {ClientNotePhotoNotFoundError} la note n'a pas de photo, ou n'est pas
 *   dans le carnet de cette société.
 * @throws {ClientNotePhotoUnreadableError} les octets rangés ne sont pas une
 *   image acceptée — incohérence entre le bucket et la base.
 */
export async function readClientNoteImage(
  locator: ClientNotePhotoLocator,
  store: DocumentStore,
  companyId: string,
  noteId: string,
  keyOf: NoteImageKey,
): Promise<StoredDocument> {
  const photoKey = await locator.photoKeyOf(companyId, noteId);
  if (photoKey === null) {
    throw new ClientNotePhotoNotFoundError(noteId);
  }
  const bytes = await store.read(keyOf(photoKey));
  const contentType = clientNoteImageContentType(bytes);
  if (contentType === null) {
    throw new ClientNotePhotoUnreadableError(noteId);
  }
  return { contentType, bytes };
}
