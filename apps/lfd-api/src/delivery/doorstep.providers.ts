import type { Provider, Type } from "@nestjs/common";

import { AuthorizeStopDepositHandler } from "./application/commands/authorize-stop-deposit.handler.js";
import { BringStopBackHandler } from "./application/commands/bring-stop-back.handler.js";
import { CloseStopWithoutHandoverHandler } from "./application/commands/close-stop-without-handover.handler.js";
import { DeclareStopArrivalHandler } from "./application/commands/declare-stop-arrival.handler.js";
import { DepositStopHandler } from "./application/commands/deposit-stop.handler.js";
import { HandOverStopHandler } from "./application/commands/hand-over-stop.handler.js";
import { ReportDeliveryIncidentHandler } from "./application/commands/report-delivery-incident.handler.js";
import { ReturnDeliveryRoundHandler } from "./application/commands/return-delivery-round.handler.js";
import { ReturnMyRoundHandler } from "./application/commands/return-my-round.handler.js";
import { DoorstepHandover } from "./application/doorstep-handover.js";
import { GetDeliveryIncidentsDayHandler } from "./application/queries/get-delivery-incidents-day.handler.js";
import { GetIncidentPhotoHandler } from "./application/queries/get-incident-photo.handler.js";
import { GetMyIncidentPhotoHandler } from "./application/queries/get-my-incident-photo.handler.js";
import { GetDecisionIncidentPhotoHandler } from "./application/queries/get-decision-incident-photo.handler.js";
import { GetPendingStopDecisionsHandler } from "./application/queries/get-pending-stop-decisions.handler.js";
import { GetUndeliveredStopsHandler } from "./application/queries/get-undelivered-stops.handler.js";
import { StopDecisionDesk } from "./application/stop-decision-desk.js";
import { StopDecisionBySetting } from "./application/stop-decision-by-setting.js";
import { StopDecisionOpening } from "./application/stop-decision-opening.js";
import { DeliveryIncidentRepository } from "./domain/ports/delivery-incident.repository.js";
import { DeliveryIncidentsReader } from "./domain/ports/delivery-incidents.reader.js";
import { DoorstepStopRepository } from "./domain/ports/doorstep-stop.repository.js";
import { IncidentPhotosReader } from "./domain/ports/incident-photos.reader.js";
import { DecisionIncidentPhotosReader } from "./domain/ports/decision-incident-photos.reader.js";
import { PendingDecisionsReader } from "./domain/ports/pending-decisions.reader.js";
import { StopDecisionRepository } from "./domain/ports/stop-decision.repository.js";
import { StopDecisionsReader } from "./domain/ports/stop-decisions.reader.js";
import { BroughtBackOrdersReader } from "./domain/ports/brought-back-orders.reader.js";
import { UndeliveredStopsReader } from "./domain/ports/undelivered-stops.reader.js";
import { DeliveryIncidentsController } from "./http/delivery-incidents.controller.js";
import { MyDeliveryDoorstepController } from "./http/my-delivery-doorstep.controller.js";
import { StopDecisionsController } from "./http/stop-decisions.controller.js";
import { PrismaDeliveryIncidentRepository } from "./infrastructure/prisma-delivery-incident.repository.js";
import {
  PrismaDeliveryIncidentsReader,
  PrismaIncidentPhotosReader,
} from "./infrastructure/prisma-delivery-incidents.reader.js";
import { PrismaDoorstepStopRepository } from "./infrastructure/prisma-doorstep-stop.repository.js";
import { PrismaStopDecisionRepository } from "./infrastructure/prisma-stop-decision.repository.js";
import {
  PrismaDecisionIncidentPhotosReader,
  PrismaPendingDecisionsReader,
  PrismaStopDecisionsReader,
} from "./infrastructure/prisma-stop-decisions.reader.js";
import { PrismaBroughtBackOrdersReader } from "./infrastructure/prisma-brought-back-orders.reader.js";
import { PrismaUndeliveredStopsReader } from "./infrastructure/prisma-undelivered-stops.reader.js";

/**
 * **À la porte** (`documentation/livraisons/plan-a-la-porte.md`, lot A), rangé
 * à part pour que `delivery.module.ts` reste lisible : les gestes du livreur
 * sous `delivery_doorstep` (arriver, signaler, clore sans remise, « Tournée
 * terminée »), et leur lecture par l'admin sous `delivery_rounds`
 * (signalements, « Non remis »). Le retour par l'admin vit sur
 * `DeliveryRoundsController` (PL2).
 *
 * « Remis au client » (B1) et « Déposé avec preuve » (B2) s'y ajoutent, sur
 * un même `DoorstepHandover` : `DoorstepHandoverAttestor`
 * vient du fil du retrait (`appBootstrap/delivery-handover-feed.module.ts`).
 *
 * La décision du commercial (B3) s'y ajoute : son ouverture au signalement,
 * la liste « À décider » et les deux réponses, sous `delivery_decisions`
 * (`StopDecisionsController`) ; `StaffNotifier` vient du module global de la
 * cloche, `BroughtBackOrdersAnnouncer` du fil du retrait. La décision réglée
 * d'avance (B3 bis, `StopDecisionBySetting`) s'applique au signalement même.
 *
 * `DeliveryOrderStatesReader` vient du fil du commerce
 * (`appBootstrap/delivery-feed.module.ts`) ; `ProductionDocumentStore` du
 * `ContextModule` global ; `DriverRoundsReader` de `driver.providers.ts`.
 */
export const DOORSTEP_CONTROLLERS: readonly Type[] = [
  MyDeliveryDoorstepController,
  DeliveryIncidentsController,
  StopDecisionsController,
];

export const DOORSTEP_PROVIDERS: readonly Provider[] = [
  DeclareStopArrivalHandler,
  ReportDeliveryIncidentHandler,
  CloseStopWithoutHandoverHandler,
  HandOverStopHandler,
  DepositStopHandler,
  DoorstepHandover,
  ReturnMyRoundHandler,
  ReturnDeliveryRoundHandler,
  GetDeliveryIncidentsDayHandler,
  GetUndeliveredStopsHandler,
  GetIncidentPhotoHandler,
  GetMyIncidentPhotoHandler,
  { provide: DoorstepStopRepository, useClass: PrismaDoorstepStopRepository },
  { provide: DeliveryIncidentRepository, useClass: PrismaDeliveryIncidentRepository },
  { provide: DeliveryIncidentsReader, useClass: PrismaDeliveryIncidentsReader },
  { provide: IncidentPhotosReader, useClass: PrismaIncidentPhotosReader },
  { provide: UndeliveredStopsReader, useClass: PrismaUndeliveredStopsReader },
  // Lu par la composition (lot RL1) : le fait vient de la décision à la porte.
  { provide: BroughtBackOrdersReader, useClass: PrismaBroughtBackOrdersReader },
  StopDecisionOpening,
  StopDecisionBySetting,
  StopDecisionDesk,
  AuthorizeStopDepositHandler,
  BringStopBackHandler,
  GetPendingStopDecisionsHandler,
  GetDecisionIncidentPhotoHandler,
  { provide: DecisionIncidentPhotosReader, useClass: PrismaDecisionIncidentPhotosReader },
  { provide: StopDecisionRepository, useClass: PrismaStopDecisionRepository },
  { provide: StopDecisionsReader, useClass: PrismaStopDecisionsReader },
  { provide: PendingDecisionsReader, useClass: PrismaPendingDecisionsReader },
];
