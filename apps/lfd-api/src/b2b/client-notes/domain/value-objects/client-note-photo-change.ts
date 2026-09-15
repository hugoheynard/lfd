import {
  type PhotoChange,
  readPhotoChange,
} from "../../../shared/photo-cards/domain/value-objects/photo-change.js";
import { ClientNotePhotoIntentError } from "../errors/client-notebook-errors.js";
import { ClientNotePhoto } from "./client-note-photo.js";

/**
 * Lit l'intention d'une révision de note : garder, retirer, ou remplacer par
 * une paire photo + vignette validée.
 *
 * Un fichier joint, quel qu'il soit, compte comme « une photo jointe » : retirer
 * la photo en joignant une vignette est la même ambiguïté qu'en joignant la
 * photo, et une vignette seule est refusée par la paire.
 *
 * @throws {ClientNotePhotoIntentError} retrait demandé ET un fichier joint.
 * @throws {ClientNotePhotoPairError} photo sans vignette, ou l'inverse.
 * @throws {InvalidClientNotePhotoError} la photo jointe n'est pas acceptée.
 * @throws {InvalidClientNoteThumbnailError} la vignette jointe n'est pas acceptée.
 */
export function clientNotePhotoChange(
  removePhoto: boolean,
  photo: Buffer | null,
  thumbnail: Buffer | null,
): PhotoChange<ClientNotePhoto> {
  return readPhotoChange(removePhoto, photo ?? thumbnail, {
    accept: () => ClientNotePhoto.create(photo, thumbnail),
    ambiguous: () => new ClientNotePhotoIntentError(),
  });
}
