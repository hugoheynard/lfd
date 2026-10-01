import type { Provider, Type } from "@nestjs/common";

import { CloseStopWithoutHandoverHandler } from "./application/commands/close-stop-without-handover.handler.js";
import { DeclareStopArrivalHandler } from "./application/commands/declare-stop-arrival.handler.js";
import { HandOverStopHandler } from "./application/commands/hand-over-stop.handler.js";
import { ReportDeliveryIncidentHandler } from "./application/commands/report-delivery-incident.handler.js";
import { ReturnDeliveryRoundHandler } from "./application/commands/return-delivery-round.handler.js";
import { ReturnMyRoundHandler } from "./application/commands/return-my-round.handler.js";
import { GetDeliveryIncidentsDayHandler } from "./application/queries/get-delivery-incidents-day.handler.js";
import { GetIncidentPhotoHandler } from "./application/queries/get-incident-photo.handler.js";
import { GetMyIncidentPhotoHandler } from "./application/queries/get-my-incident-photo.handler.js";
import { GetUndeliveredStopsHandler } from "./application/queries/get-undelivered-stops.handler.js";
import { DeliveryIncidentRepository } from "./domain/ports/delivery-incident.repository.js";
import { DeliveryIncidentsReader } from "./domain/ports/delivery-incidents.reader.js";
import { DoorstepStopRepository } from "./domain/ports/doorstep-stop.repository.js";
import { IncidentPhotosReader } from "./domain/ports/incident-photos.reader.js";
import { UndeliveredStopsReader } from "./domain/ports/undelivered-stops.reader.js";
import { DeliveryIncidentsController } from "./http/delivery-incidents.controller.js";
import { MyDeliveryDoorstepController } from "./http/my-delivery-doorstep.controller.js";
import { PrismaDeliveryIncidentRepository } from "./infrastructure/prisma-delivery-incident.repository.js";
import {
  PrismaDeliveryIncidentsReader,
  PrismaIncidentPhotosReader,
} from "./infrastructure/prisma-delivery-incidents.reader.js";
import { PrismaDoorstepStopRepository } from "./infrastructure/prisma-doorstep-stop.repository.js";
import { PrismaUndeliveredStopsReader } from "./infrastructure/prisma-undelivered-stops.reader.js";

/**
 * **À la porte** (`documentation/livraisons/plan-a-la-porte.md`, lot A), rangé
 * à part pour que `delivery.module.ts` reste lisible : les gestes du livreur
 * sous `delivery_doorstep` (arriver, signaler, clore sans remise, « Tournée
 * terminée »), et leur lecture par l'admin sous `delivery_rounds`
 * (signalements, « Non remis »). Le retour par l'admin vit sur
 * `DeliveryRoundsController` (PL2).
 *
 * « Remis au client » (lot B, B1) s'y ajoute : `DoorstepHandoverAttestor`
 * vient du fil du retrait (`appBootstrap/delivery-handover-feed.module.ts`).
 *
 * `DeliveryOrderStatesReader` vient du fil du commerce
 * (`appBootstrap/delivery-feed.module.ts`) ; `ProductionDocumentStore` du
 * `ContextModule` global ; `DriverRoundsReader` de `driver.providers.ts`.
 */
export const DOORSTEP_CONTROLLERS: readonly Type[] = [
  MyDeliveryDoorstepController,
  DeliveryIncidentsController,
];

export const DOORSTEP_PROVIDERS: readonly Provider[] = [
  DeclareStopArrivalHandler,
  ReportDeliveryIncidentHandler,
  CloseStopWithoutHandoverHandler,
  HandOverStopHandler,
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
];
