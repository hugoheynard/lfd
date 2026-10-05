import type { ClientNotebook } from "../entities/client-notebook.js";

/**
 * Port d'**écriture** du carnet de notes : il prend et rend l'agrégat, jamais
 * des colonnes.
 *
 * `companyId` est le mur : le carnet d'une autre société n'existe pas pour ce
 * port.
 */
export abstract class ClientNotebookRepository {
  /** Le carnet de cette société, ou `null` s'il n'a pas encore reçu de note. */
  abstract loadForCompany(companyId: string): Promise<ClientNotebook | null>;

  /**
   * Écrit le carnet **en une transaction**, en ne touchant que ce qui a changé
   * (`documentation/b2b/comptes-client/notes-du-commercial.md`) : la
   * racine si elle est neuve, les notes retirées, la note ajoutée ou refaite, et
   * la position des notes qui ont bougé.
   */
  abstract save(notebook: ClientNotebook): Promise<void>;
}
