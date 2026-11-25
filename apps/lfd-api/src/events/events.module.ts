import { Module } from "@nestjs/common";

import { ArchiveEventHandler } from "./event/application/commands/archive-event.handler.js";
import { DeclareEventHandler } from "./event/application/commands/declare-event.handler.js";
import { ReviseEventHandler } from "./event/application/commands/revise-event.handler.js";
import { GetEventHandler } from "./event/application/queries/get-event.handler.js";
import { ListEventsHandler } from "./event/application/queries/list-events.handler.js";
import { EventReader } from "./event/domain/ports/event.reader.js";
import { EventRepository } from "./event/domain/ports/event.repository.js";
import { AdminEventsController } from "./event/http/admin-events.controller.js";
import { PrismaEventReader } from "./event/infrastructure/prisma-event.reader.js";
import { PrismaEventRepository } from "./event/infrastructure/prisma-event.repository.js";
import { ArchiveFunctionSheetHandler } from "./function-sheet/application/commands/archive-function-sheet.handler.js";
import { DepositFunctionSheetHandler } from "./function-sheet/application/commands/deposit-function-sheet.handler.js";
import { ReplaceFunctionSheetHandler } from "./function-sheet/application/commands/replace-function-sheet.handler.js";
import { GetFunctionSheetFileHandler } from "./function-sheet/application/queries/get-function-sheet-file.handler.js";
import { FunctionSheetReader } from "./function-sheet/domain/ports/function-sheet.reader.js";
import { AdminEventFunctionSheetsController } from "./function-sheet/http/admin-event-function-sheets.controller.js";
import { PrismaFunctionSheetReader } from "./function-sheet/infrastructure/prisma-function-sheet.reader.js";

/**
 * **Le bloc des événements** : l'événement et ses fiches de fonction, dans le
 * schéma `events` (`documentation/evenements/plan-evenements.md`). Il
 * n'importe que le socle et la plateforme ; seule la racine l'importe.
 */
@Module({
  controllers: [AdminEventsController, AdminEventFunctionSheetsController],
  providers: [
    DeclareEventHandler,
    ReviseEventHandler,
    ArchiveEventHandler,
    ListEventsHandler,
    GetEventHandler,
    DepositFunctionSheetHandler,
    ArchiveFunctionSheetHandler,
    ReplaceFunctionSheetHandler,
    GetFunctionSheetFileHandler,
    { provide: EventRepository, useClass: PrismaEventRepository },
    { provide: EventReader, useClass: PrismaEventReader },
    { provide: FunctionSheetReader, useClass: PrismaFunctionSheetReader },
  ],
})
export class EventsBlockModule {}
