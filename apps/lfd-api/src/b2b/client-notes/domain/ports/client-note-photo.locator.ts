/**
 * Port de **lecture** de la clé de photo d'une note.
 *
 * Séparé de {@link ClientNotebookReader} parce que ses consommateurs le sont :
 * servir une image n'a besoin ni des titres ni des descriptions, et la route de
 * la vignette est appelée une fois par note affichée.
 */
export abstract class ClientNotePhotoLocator {
  /**
   * La clé de la photo lisible de la note, ou `null` si la note n'en a pas — ou
   * n'appartient pas au carnet de cette société.
   */
  abstract photoKeyOf(companyId: string, noteId: string): Promise<string | null>;
}
