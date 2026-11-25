import type { Buffer } from "node:buffer";

/** Une fiche de fonction prête à joindre : son identifiant, son nom, ses octets PDF. */
export interface EventFunctionSheetFile {
  readonly sheetId: string;
  readonly fileName: string;
  readonly bytes: Buffer;
}

/** Les fiches d'un événement, dans l'ordre de leur rang. */
export interface EventFunctionSheets {
  readonly eventId: string;
  readonly eventName: string;
  readonly sheets: readonly EventFunctionSheetFile[];
}

/**
 * **« Quelles fiches de fonction joindre au dossier de ce jour ? »** — port
 * étroit que le fournil DÉCLARE et que les événements IMPLÉMENTENT
 * (`documentation/evenements/plan-evenements.md`), relié dans `appBootstrap`.
 *
 * Les fiches **en vigueur** au moment de l'appel : une fiche remplacée sort
 * dans sa version la plus récente à chaque tirage. Seuls les événements non
 * archivés qui concernent la Folie Coffee comptent — le filtre est chez
 * l'implémentation, le fournil ne sait pas ce qu'est une application.
 *
 * Une panne (base, stockage) lève : le dossier part alors sans les fiches,
 * et n'est pas archivé.
 */
export abstract class EventFunctionSheetsReader {
  /** Par événement du jour (`AAAA-MM-JJ`), ses fiches en vigueur ; vide si aucun. */
  abstract sheetsFor(serviceDay: string): Promise<readonly EventFunctionSheets[]>;
}
