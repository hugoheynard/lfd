import type { Provider, Type } from "@nestjs/common";

import { AcknowledgeDriverNoticeHandler } from "./application/commands/acknowledge-driver-notice.handler.js";
import { AssignDeliveryDriverHandler } from "./application/commands/assign-delivery-driver.handler.js";
import { DepartMyRoundHandler } from "./application/commands/depart-my-round.handler.js";
import { LoadMyBinHandler } from "./application/commands/load-my-bin.handler.js";
import { UnloadMyBinHandler } from "./application/commands/unload-my-bin.handler.js";
import { UnassignDeliveryDriverHandler } from "./application/commands/unassign-delivery-driver.handler.js";
import { GetMyDriverNoticeHandler } from "./application/queries/get-my-driver-notice.handler.js";
import { GetMyDeliveryRoundHandler } from "./application/queries/get-my-delivery-round.handler.js";
import { GetMyLoadingPlanHandler } from "./application/queries/get-my-loading-plan.handler.js";
import { GetMyLoadingRoundHandler } from "./application/queries/get-my-loading-round.handler.js";
import { GetMyRoundVersionHandler } from "./application/queries/get-my-round-version.handler.js";
import { GetMyStopStepPhotoHandler } from "./application/queries/get-my-stop-step-photo.handler.js";
import { GetMyDeliveryRoundsHandler } from "./application/queries/get-my-delivery-rounds.handler.js";
import { ListDeliveryDriversHandler } from "./application/queries/list-delivery-drivers.handler.js";
import { StopSheets } from "./application/stop-sheets.js";
import { DriverNoticeAcknowledgementRepository } from "./domain/ports/driver-notice-acknowledgement.repository.js";
import { DriverNoticeAcknowledgementsReader } from "./domain/ports/driver-notice-acknowledgements.reader.js";
import { DriverRoundWall } from "./domain/ports/driver-round-wall.js";
import { DriverRoundsReader } from "./domain/ports/driver-rounds.reader.js";
import { MyDeliveryLoadingController } from "./http/my-delivery-loading.controller.js";
import { MyDriverNoticeController } from "./http/my-driver-notice.controller.js";
import { MyDeliveryRoundController } from "./http/my-delivery-round.controller.js";
import { PrismaDriverNoticeAcknowledgementRepository } from "./infrastructure/prisma-driver-notice-acknowledgement.repository.js";
import { PrismaDriverNoticeAcknowledgementsReader } from "./infrastructure/prisma-driver-notice-acknowledgements.reader.js";
import { PrismaDriverRoundWall } from "./infrastructure/prisma-driver-round-wall.js";
import { PrismaDriverRoundsReader } from "./infrastructure/prisma-driver-rounds.reader.js";

/**
 * **Le livreur** (`plan-ma-tournee.md`, MT2 et MT3), rangé à part pour que
 * `delivery.module.ts` reste lisible : l'affecter à une tournée (ses routes
 * vivent sur `DeliveryRoundsController`, sous `delivery_rounds`), puis sa
 * page « Ma tournée » sous `delivery_driving` — sa fiche et sa version
 * (PL4), le chargement de SA tournée (PL1), et « Mes données » — le texte
 * d'information du livreur et son accusé (`rgpd-livreur.md`, §7 point 2).
 *
 * `StaffPermissionHolders` et `StaffAuthorDirectory` viennent du module
 * global de l'annuaire (`StaffAuthorsModule`) ; `DeliveryProceduresReader`
 * `DeliveryStepPhotosReader`, `DeliveryOrderLinesReader` et
 * `CommerceDayVersionReader` du fil relié dans `appBootstrap/delivery-feed.module.ts`.
 */
export const DRIVER_CONTROLLERS: readonly Type[] = [
  MyDeliveryRoundController,
  MyDeliveryLoadingController,
  MyDriverNoticeController,
];

export const DRIVER_PROVIDERS: readonly Provider[] = [
  AssignDeliveryDriverHandler,
  UnassignDeliveryDriverHandler,
  ListDeliveryDriversHandler,
  GetMyDeliveryRoundsHandler,
  GetMyDeliveryRoundHandler,
  DepartMyRoundHandler,
  GetMyStopStepPhotoHandler,
  GetMyRoundVersionHandler,
  GetMyLoadingRoundHandler,
  GetMyLoadingPlanHandler,
  LoadMyBinHandler,
  UnloadMyBinHandler,
  AcknowledgeDriverNoticeHandler,
  GetMyDriverNoticeHandler,
  StopSheets,
  { provide: DriverRoundsReader, useClass: PrismaDriverRoundsReader },
  { provide: DriverRoundWall, useClass: PrismaDriverRoundWall },
  {
    provide: DriverNoticeAcknowledgementRepository,
    useClass: PrismaDriverNoticeAcknowledgementRepository,
  },
  {
    provide: DriverNoticeAcknowledgementsReader,
    useClass: PrismaDriverNoticeAcknowledgementsReader,
  },
];
