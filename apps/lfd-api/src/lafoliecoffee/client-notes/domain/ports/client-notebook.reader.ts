import type { ClientNotebookView } from "@lfd/contracts";

/**
 * Port de **lecture** du carnet, prêt pour l'écran.
 *
 * Distinct du dépôt : l'écran veut un numéro, une révision de photo, une date
 * et un nom d'auteur, que l'agrégat n'a aucune raison de mettre en forme.
 */
export abstract class ClientNotebookReader {
  /** Le carnet de la société — `notes` vide quand il n'en a pas. */
  abstract read(companyId: string): Promise<ClientNotebookView>;
}
