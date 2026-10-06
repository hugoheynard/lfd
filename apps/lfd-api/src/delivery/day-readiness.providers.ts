import type { Provider, Type } from "@nestjs/common";

import { LearnArrestedPlan } from "./application/handlers/learn-arrested-plan.handler.js";
import { LearnRetakenPlan } from "./application/handlers/learn-retaken-plan.handler.js";
import { DayStopsLocator } from "./application/day-stops-locator.js";
import { DeliveryStopsLocating } from "./application/delivery-stops-locating.js";
import { PlanArrestedBell } from "./application/plan-arrested-bell.js";
import { RingRoundsGapBellHandler } from "./application/commands/ring-rounds-gap-bell.handler.js";
import { GetDeliveryDayReadinessHandler } from "./application/queries/get-delivery-day-readiness.handler.js";
import { DeliveryDayReadinessReader } from "./domain/ports/delivery-day-readiness.reader.js";
import { DeliveryDayReadinessRepository } from "./domain/ports/delivery-day-readiness.repository.js";
import { DeliveryDayReadinessController } from "./http/delivery-day-readiness.controller.js";
import { DeliveryRoundsGapSweepController } from "./http/delivery-rounds-gap-sweep.controller.js";
import { PrismaDeliveryDayReadinessReader } from "./infrastructure/prisma-delivery-day-readiness.reader.js";
import { PrismaDeliveryDayReadinessRepository } from "./infrastructure/prisma-delivery-day-readiness.repository.js";

/**
 * **Le plan arrêté, vu par la livraison** (`documentation/livraisons/composition-automatique.md`,
 * §4, CA6a) : les abonnés à la clôture et au retirage (CA6b), leur cloche, et la lecture de l'écran
 * des tournées, le géocodage de fond qui situe les adresses (CA0), et l'alerte « hors tournée » avant le jour J (§5). Rangé à part pour que `delivery.module.ts` reste lisible.
 */
export const DAY_READINESS_CONTROLLERS: readonly Type[] = [
  DeliveryDayReadinessController,
  DeliveryRoundsGapSweepController,
];

export const DAY_READINESS_PROVIDERS: readonly Provider[] = [
  LearnArrestedPlan,
  LearnRetakenPlan,
  PlanArrestedBell,
  // CA0 : situer l'adresse dès la commande, et rattraper à l'arrêt du plan.
  DeliveryStopsLocating,
  { provide: DayStopsLocator, useExisting: DeliveryStopsLocating },
  GetDeliveryDayReadinessHandler,
  // L'alerte avant le jour J : la cloche « hors tournée », passée par la machine.
  RingRoundsGapBellHandler,
  { provide: DeliveryDayReadinessRepository, useClass: PrismaDeliveryDayReadinessRepository },
  { provide: DeliveryDayReadinessReader, useClass: PrismaDeliveryDayReadinessReader },
];
