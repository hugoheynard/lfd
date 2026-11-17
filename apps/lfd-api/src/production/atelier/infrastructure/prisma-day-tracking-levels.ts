import { Injectable } from "@nestjs/common";

import { readStringMapColumn } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ServiceDay } from "../../day/index.js";
import {
  DayTrackingLevelsFreezer,
  FrozenTrackingLevelsReader,
} from "../domain/ports/day-tracking-levels.ports.js";
import type { DayTrackingLevels } from "../domain/services/tracking-levels.js";
import { trackingLevelFrom } from "./tracking-level-column.js";

const TABLE = "production_day_tracking_level";

/** Le niveau figé d'une journée, relu : les niveaux revalidés, la carte rebâtie. */
@Injectable()
export class PrismaFrozenTrackingLevelsReader extends FrozenTrackingLevelsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async frozenOf(day: ServiceDay): Promise<DayTrackingLevels | null> {
    const row = await this.prisma.productionDayTrackingLevel.findUnique({
      where: { serviceDay: day.value },
      select: { houseLevel: true, workstationLevels: true },
    });
    if (row === null) {
      return null;
    }
    const stations = readStringMapColumn(row.workstationLevels, `${TABLE}.workstation_levels`);
    return {
      house: trackingLevelFrom(row.houseLevel, TABLE),
      workstations: new Map(
        Object.entries(stations).map(([id, level]) => [id, trackingLevelFrom(level, TABLE)]),
      ),
    };
  }
}

/**
 * Le niveau figé d'une journée, écrit une fois : `createMany({ skipDuplicates })`
 * compile en `INSERT … ON CONFLICT DO NOTHING` sur la journée. Le déclencheur
 * du journal de la journée fait relire la fiche.
 */
@Injectable()
export class PrismaDayTrackingLevelsFreezer extends DayTrackingLevelsFreezer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async freeze(day: ServiceDay, levels: DayTrackingLevels, at: Date): Promise<void> {
    await this.prisma.productionDayTrackingLevel.createMany({
      data: [
        {
          serviceDay: day.value,
          houseLevel: levels.house,
          workstationLevels: Object.fromEntries(levels.workstations),
          frozenAt: at,
        },
      ],
      skipDuplicates: true,
    });
  }
}
