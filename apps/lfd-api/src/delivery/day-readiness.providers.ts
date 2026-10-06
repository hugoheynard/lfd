import type { Provider, Type } from "@nestjs/common";

import { LearnArrestedPlan } from "./application/handlers/learn-arrested-plan.handler.js";
import { LearnRetakenPlan } from "./application/handlers/learn-retaken-plan.handler.js";
import { PlanArrestedBell } from "./application/plan-arrested-bell.js";
import { GetDeliveryDayReadinessHandler } from "./application/queries/get-delivery-day-readiness.handler.js";
import { DeliveryDayReadinessReader } from "./domain/ports/delivery-day-readiness.reader.js";
import { DeliveryDayReadinessRepository } from "./domain/ports/delivery-day-readiness.repository.js";
import { DeliveryDayReadinessController } from "./http/delivery-day-readiness.controller.js";
import { PrismaDeliveryDayReadinessReader } from "./infrastructure/prisma-delivery-day-readiness.reader.js";
import { PrismaDeliveryDayReadinessRepository } from "./infrastructure/prisma-delivery-day-readiness.repository.js";

/**
 * **Le plan arrêté, vu par la livraison** (`documentation/livraisons/composition-automatique.md`,
 * §4, CA6a) : les abonnés à la clôture et au retirage (CA6b), leur cloche, et la lecture de l'écran
 * des tournées. Rangé à part pour que `delivery.module.ts` reste lisible.
 */
export const DAY_READINESS_CONTROLLERS: readonly Type[] = [DeliveryDayReadinessController];

export const DAY_READINESS_PROVIDERS: readonly Provider[] = [
  LearnArrestedPlan,
  LearnRetakenPlan,
  PlanArrestedBell,
  GetDeliveryDayReadinessHandler,
  { provide: DeliveryDayReadinessRepository, useClass: PrismaDeliveryDayReadinessRepository },
  { provide: DeliveryDayReadinessReader, useClass: PrismaDeliveryDayReadinessReader },
];
