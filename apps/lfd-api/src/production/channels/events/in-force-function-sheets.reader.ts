/** Une fiche de fonction en vigueur, sans ses octets. */
export interface InForceFunctionSheet {
  readonly sheetId: string;
  readonly fileName: string;
  readonly eventName: string;
}

/**
 * **« Quelles fiches de fonction sont en vigueur ce jour ? »**, sans lire le
 * stockage — port à part (ISP) : la fenêtre d'impression n'a besoin que de
 * savoir s'il y en a, et lesquelles ont été remplacées depuis un tirage.
 * Même filtre que `EventFunctionSheetsReader`.
 */
export abstract class InForceFunctionSheetsReader {
  /** Les fiches en vigueur du jour (`AAAA-MM-JJ`), événement par événement, dans l'ordre du rang. */
  abstract inForceOn(serviceDay: string): Promise<readonly InForceFunctionSheet[]>;
}
