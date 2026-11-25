/** Où se trouve une fiche en vigueur, pour la servir. */
export interface FunctionSheetLocation {
  readonly fileName: string;
  readonly storageKey: string;
  readonly contentType: string;
}

/**
 * Port de **lecture** d'une fiche de fonction, pour la servir. À part du
 * lecteur des événements (ISP) : le téléchargement n'a besoin que de ceci.
 */
export abstract class FunctionSheetReader {
  /** Une fiche **en vigueur** de cet événement, ou `null` (retirée, d'un autre, absente). */
  abstract locate(eventId: string, sheetId: string): Promise<FunctionSheetLocation | null>;
}
