import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { IssueInHouseRecapsHandler } from "./application/commands/issue-in-house-recaps.handler.js";
import { ReissueInHouseRecapHandler } from "./application/commands/reissue-in-house-recap.handler.js";
import { ResendInHouseRecapHandler } from "./application/commands/resend-in-house-recap.handler.js";
import { GetInHouseRecapDocumentHandler } from "./application/queries/get-in-house-recap-document.handler.js";
import { GetInHouseRecapSpecimenHandler } from "./application/queries/get-in-house-recap-specimen.handler.js";
import { GetInHouseRecapHandler } from "./application/queries/get-in-house-recap.handler.js";
import { ListPayerInHouseRecapsHandler } from "./application/queries/list-payer-in-house-recaps.handler.js";
import { ListRevisedInHouseRecapsHandler } from "./application/queries/list-revised-in-house-recaps.handler.js";
import { CurrentNoteVersionsReader } from "./domain/ports/current-note-versions.reader.js";
import { InHouseRecapDocument } from "./domain/ports/in-house-recap-document.js";
import { InHouseRecapReader } from "./domain/ports/in-house-recap.reader.js";
import { InHouseRecapRepository } from "./domain/ports/in-house-recap.repository.js";
import { InHouseRecapRuns } from "./domain/ports/in-house-recap-runs.js";
import { InHouseRecapRunsReader } from "./domain/ports/in-house-recap-runs.reader.js";
import { PayerRecapsReader } from "./domain/ports/payer-recaps.reader.js";
import { InHouseRecapDocumentKeeper } from "./application/services/in-house-recap-document-keeper.js";
import { InHouseRecapMailer } from "./application/services/in-house-recap-mailer.js";
import { MailedInHouseRecapDocument } from "./application/services/mailed-in-house-recap.document.js";
import { RecapRecipientReader } from "./domain/ports/recap-recipient.reader.js";
import { ReplacedRecapReader } from "./domain/ports/replaced-recap.reader.js";
import { RecapDeliveryNotesReader } from "./domain/ports/recap-delivery-notes.reader.js";
import { RecapNumbering } from "./domain/ports/recap-numbering.js";
import { RevisedRecapsReader } from "./domain/ports/revised-recaps.reader.js";
import { AdminInHouseRecapsController } from "./http/admin-in-house-recaps.controller.js";
import { AdminInHouseRecapSpecimenController } from "./http/admin-in-house-recap-specimen.controller.js";
import { InHouseRecapsAutopilotController } from "./http/in-house-recaps-autopilot.controller.js";
import {
  PrismaInHouseRecapRuns,
  PrismaInHouseRecapRunsReader,
} from "./infrastructure/prisma-in-house-recap-runs.js";
import { PrismaInHouseRecapReader } from "./infrastructure/prisma-in-house-recap.reader.js";
import { PrismaInHouseRecapRepository } from "./infrastructure/prisma-in-house-recap.repository.js";
import { PrismaRecapDeliveryNotesReader } from "./infrastructure/prisma-recap-delivery-notes.reader.js";
import { PrismaRecapNumbering } from "./infrastructure/prisma-recap-numbering.js";
import { PrismaRecapRecipientReader } from "./infrastructure/prisma-recap-recipient.reader.js";
import { PrismaReplacedRecapReader } from "./infrastructure/prisma-replaced-recap.reader.js";
import {
  PrismaCurrentNoteVersionsReader,
  PrismaPayerRecapsReader,
  PrismaRevisedRecapsReader,
} from "./infrastructure/prisma-recap-revisions.readers.js";

/**
 * **Le récapitulatif des BL des restaurants maison**
 * (`documentation/comptabilite/facturation/restaurants-maison.md`) :
 * à la place de la facture, un document figé, sans montant, des
 * quantités remises par produit sur le mois civil de Paris.
 *
 * Contexte à part de la facturation : il ne facture rien, ne lit aucune de
 * ses tables, et n'a pas de branche dans son automatisme. Il lit le BL
 * courant et la commande (même bloc), et la nature maison par les lectures
 * qu'`account/` publie.
 */
@Module({
  imports: [AccountModule],
  controllers: [
    InHouseRecapsAutopilotController,
    AdminInHouseRecapsController,
    AdminInHouseRecapSpecimenController,
  ],
  providers: [
    IssueInHouseRecapsHandler,
    ReissueInHouseRecapHandler,
    ListPayerInHouseRecapsHandler,
    GetInHouseRecapHandler,
    ListRevisedInHouseRecapsHandler,
    ResendInHouseRecapHandler,
    GetInHouseRecapDocumentHandler,
    GetInHouseRecapSpecimenHandler,
    InHouseRecapDocumentKeeper,
    InHouseRecapMailer,
    { provide: InHouseRecapRepository, useClass: PrismaInHouseRecapRepository },
    { provide: InHouseRecapReader, useClass: PrismaInHouseRecapReader },
    { provide: RecapDeliveryNotesReader, useClass: PrismaRecapDeliveryNotesReader },
    { provide: InHouseRecapRuns, useClass: PrismaInHouseRecapRuns },
    { provide: InHouseRecapRunsReader, useClass: PrismaInHouseRecapRunsReader },
    { provide: RecapNumbering, useClass: PrismaRecapNumbering },
    { provide: CurrentNoteVersionsReader, useClass: PrismaCurrentNoteVersionsReader },
    { provide: PayerRecapsReader, useClass: PrismaPayerRecapsReader },
    { provide: RevisedRecapsReader, useClass: PrismaRevisedRecapsReader },
    { provide: RecapRecipientReader, useClass: PrismaRecapRecipientReader },
    { provide: ReplacedRecapReader, useClass: PrismaReplacedRecapReader },
    // Le document d'un récapitulatif émis (D10) : le PDF rangé, puis l'e-mail.
    { provide: InHouseRecapDocument, useClass: MailedInHouseRecapDocument },
  ],
})
export class InHouseRecapsModule {}
