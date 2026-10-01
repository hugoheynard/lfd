import type { Provider, Type } from "@nestjs/common";

import { AssignDeliveryDriverHandler } from "./application/commands/assign-delivery-driver.handler.js";
import { DepartMyRoundHandler } from "./application/commands/depart-my-round.handler.js";
import { UnassignDeliveryDriverHandler } from "./application/commands/unassign-delivery-driver.handler.js";
import { GetMyDeliveryRoundHandler } from "./application/queries/get-my-delivery-round.handler.js";
import { GetMyStopStepPhotoHandler } from "./application/queries/get-my-stop-step-photo.handler.js";
import { GetMyDeliveryRoundsHandler } from "./application/queries/get-my-delivery-rounds.handler.js";
import { ListDeliveryDriversHandler } from "./application/queries/list-delivery-drivers.handler.js";
import { DriverRoundsReader } from "./domain/ports/driver-rounds.reader.js";
import { MyDeliveryRoundController } from "./http/my-delivery-round.controller.js";
import { PrismaDriverRoundsReader } from "./infrastructure/prisma-driver-rounds.reader.js";

/**
 * **Le livreur** (`plan-ma-tournee.md`, MT2 et MT3), rangé à part pour que
 * `delivery.module.ts` reste lisible : l'affecter à une tournée (ses routes
 * vivent sur `DeliveryRoundsController`, sous `delivery_rounds`), puis sa
 * page « Ma tournée » sous `delivery_driving`.
 *
 * `StaffPermissionHolders` et `StaffAuthorDirectory` viennent du module
 * global de l'annuaire (`StaffAuthorsModule`) ; `DeliveryProceduresReader`
 * et `DeliveryStepPhotosReader` du fil relié dans `appBootstrap/delivery-feed.module.ts`.
 */
export const DRIVER_CONTROLLERS: readonly Type[] = [MyDeliveryRoundController];

export const DRIVER_PROVIDERS: readonly Provider[] = [
  AssignDeliveryDriverHandler,
  UnassignDeliveryDriverHandler,
  ListDeliveryDriversHandler,
  GetMyDeliveryRoundsHandler,
  GetMyDeliveryRoundHandler,
  DepartMyRoundHandler,
  GetMyStopStepPhotoHandler,
  { provide: DriverRoundsReader, useClass: PrismaDriverRoundsReader },
];
