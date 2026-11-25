/**
 * **Le canal que la production déclare POUR les événements**
 * (`documentation/evenements/plan-evenements.md`).
 *
 * | Pièce                         | Nature | Ce qu'elle porte                                         |
 * | ----------------------------- | ------ | -------------------------------------------------------- |
 * | `EventFunctionSheetsReader`   | port   | les fiches de fonction du jour, octets compris — le dossier |
 * | `InForceFunctionSheetsReader` | port   | les mêmes sans octets — la fenêtre d'impression          |
 *
 * `lint:context-boundaries` n'autorise `events → production` que par ce
 * dossier, et `production → events` jamais : le fournil ne sait pas qui lui
 * fournit des fiches.
 */
export {
  type EventFunctionSheetFile,
  type EventFunctionSheets,
  EventFunctionSheetsReader,
} from "./event-function-sheets.reader.js";
export {
  type InForceFunctionSheet,
  InForceFunctionSheetsReader,
} from "./in-force-function-sheets.reader.js";
