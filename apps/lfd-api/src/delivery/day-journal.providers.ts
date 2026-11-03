import type { Provider, Type } from "@nestjs/common";

import { PruneDeliveryDayChangesHandler } from "./application/commands/prune-delivery-day-changes.handler.js";
import { DeliveryDayVersionSource } from "./application/delivery-day-version.source.js";
import { DeliveryDayChangePruner } from "./domain/ports/delivery-day-change.pruner.js";
import { DeliveryDayVersionReader } from "./domain/ports/delivery-day-version.reader.js";
import { DeliveryDayChangeSweepController } from "./http/delivery-day-change-sweep.controller.js";
import { PrismaDeliveryDayChangePruner } from "./infrastructure/prisma-delivery-day-change.pruner.js";
import { PrismaDeliveryDayVersionReader } from "./infrastructure/prisma-delivery-day-version.reader.js";

/**
 * **Le journal des journées de la livraison** (`plan-schema-delivery.md`,
 * SD-D3), rangé à part pour que `delivery.module.ts` reste lisible : lire la
 * version d'une journée (la source `delivery` de la porte unique
 * `admin/day-versions`), et balayer les traces anciennes. Deux ports, deux
 * adaptateurs (ISP).
 */
export const DAY_JOURNAL_CONTROLLERS: readonly Type[] = [DeliveryDayChangeSweepController];

export const DAY_JOURNAL_PROVIDERS: readonly Provider[] = [
  DeliveryDayVersionSource,
  PruneDeliveryDayChangesHandler,
  { provide: DeliveryDayVersionReader, useClass: PrismaDeliveryDayVersionReader },
  { provide: DeliveryDayChangePruner, useClass: PrismaDeliveryDayChangePruner },
];
