import { Global, Module } from "@nestjs/common";

import { PrismaInForceFunctionSheetsReader } from "../events/channels/production/prisma-in-force-function-sheets.reader.js";
import { StoredEventFunctionSheetsReader } from "../events/channels/production/stored-event-function-sheets.reader.js";
import {
  EventFunctionSheetsReader,
  InForceFunctionSheetsReader,
} from "../production/channels/events/index.js";

/**
 * **Le fil des événements vers le fournil, relié**
 * (`documentation/evenements/plan-evenements.md`).
 *
 * - `EventFunctionSheetsReader` — la production DÉCLARE, les événements
 *   implémentent : les fiches de fonction en vigueur d'un jour, octets
 *   compris, que le dossier du jour joint à la fin.
 * - `InForceFunctionSheetsReader` — même figure, sans le stockage : la
 *   fenêtre d'impression et les fiches remplacées depuis un tirage.
 *
 * `@Global` pour la raison des autres fils : `production/` ne peut pas
 * importer `events/`, ni l'inverse hors du canal. Les adaptateurs ne lisent
 * que `PrismaService` et le stockage du fournil, tous deux globaux.
 */
@Global()
@Module({
  providers: [
    { provide: EventFunctionSheetsReader, useClass: StoredEventFunctionSheetsReader },
    { provide: InForceFunctionSheetsReader, useClass: PrismaInForceFunctionSheetsReader },
  ],
  exports: [EventFunctionSheetsReader, InForceFunctionSheetsReader],
})
export class EventsFeedModule {}
