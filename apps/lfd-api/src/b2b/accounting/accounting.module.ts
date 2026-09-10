import { Module } from "@nestjs/common";

import { AssignCreditorIdentifierHandler } from "./application/commands/assign-creditor-identifier.handler.js";
import { CorrectLegalEntityHandler } from "./application/commands/correct-legal-entity.handler.js";
import { DeclareLegalEntityHandler } from "./application/commands/declare-legal-entity.handler.js";
import { SetCreditorAccountHandler } from "./application/commands/set-creditor-account.handler.js";
import { SetLegalEntityArchivedHandler } from "./application/commands/set-legal-entity-archived.handler.js";
import { SetPreNotificationHandler } from "./application/commands/set-pre-notification.handler.js";
import { GetLegalEntityHandler } from "./application/queries/get-legal-entity.handler.js";
import { ListLegalEntitiesHandler } from "./application/queries/list-legal-entities.handler.js";
import { CreditorReader } from "./domain/ports/creditor.reader.js";
import { LegalEntityReader } from "./domain/ports/legal-entity.reader.js";
import { LegalEntityRepository } from "./domain/ports/legal-entity.repository.js";
import { AdminLegalEntitiesController } from "./http/admin-legal-entities.controller.js";
import { PrismaCreditorReader } from "./infrastructure/prisma-creditor.reader.js";
import { PrismaLegalEntityReader } from "./infrastructure/prisma-legal-entity.reader.js";
import { PrismaLegalEntityRepository } from "./infrastructure/prisma-legal-entity.repository.js";

/**
 * Contexte **comptabilité** — qui encaisse, et sous quelle identité.
 *
 * Trois ports sur une seule table, et l'ISP n'est pas ici une élégance :
 * `CreditorReader` est le **seul** exporté, parce qu'il est le seul que d'autres
 * contextes ont le droit de consommer. Il rend une copie figée. Exporter le port
 * d'écriture laisserait `payments` charger l'agrégat et le muter depuis chez
 * lui — et l'immuabilité de l'ICS ne serait plus tenue par personne.
 */
@Module({
  controllers: [AdminLegalEntitiesController],
  providers: [
    { provide: LegalEntityRepository, useClass: PrismaLegalEntityRepository },
    { provide: LegalEntityReader, useClass: PrismaLegalEntityReader },
    { provide: CreditorReader, useClass: PrismaCreditorReader },
    DeclareLegalEntityHandler,
    CorrectLegalEntityHandler,
    AssignCreditorIdentifierHandler,
    SetCreditorAccountHandler,
    SetPreNotificationHandler,
    SetLegalEntityArchivedHandler,
    ListLegalEntitiesHandler,
    GetLegalEntityHandler,
  ],
  exports: [CreditorReader],
})
export class AccountingModule {}
