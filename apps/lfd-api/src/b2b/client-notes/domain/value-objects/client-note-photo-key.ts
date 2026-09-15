/** Le dossier des vignettes, sous celui des photos de notes. */
const THUMBNAILS_FOLDER = "thumbs/";

/**
 * La clé de rangement de la photo lisible d'une note.
 *
 * Ancrée sur la société — le mur de tenancy du stockage est dans le chemin. Le
 * suffixe `revision` change à chaque dépôt : un remplacement n'écrase jamais
 * l'ancienne photo tant que la base ne pointe pas vers la nouvelle, et l'écran
 * invalide son image sur ce seul suffixe (`photoCardRevision`).
 */
export function clientNotePhotoKey(companyId: string, noteId: string, revision: string): string {
  return `companies/${companyId}/client-notes/${noteId}-${revision}`;
}

/**
 * La clé de la vignette, **dérivée** de celle de la photo : même dossier, sous
 * `thumbs/`, même nom donc même révision. Dérivée plutôt que gardée en colonne :
 * les deux objets sont rangés et supprimés ensemble, et une seconde colonne
 * pourrait désigner la vignette d'une autre révision.
 *
 * Pas de suffixe `-thumb` : la révision se lit après le dernier tiret, et un
 * suffixe la ferait lire `thumb` (plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D7).
 */
export function clientNoteThumbnailKey(photoKey: string): string {
  const folderEnd = photoKey.lastIndexOf("/") + 1;
  return `${photoKey.slice(0, folderEnd)}${THUMBNAILS_FOLDER}${photoKey.slice(folderEnd)}`;
}
