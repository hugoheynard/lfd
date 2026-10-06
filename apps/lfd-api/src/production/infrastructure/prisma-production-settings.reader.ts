import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { CloseSettingsValues } from "../domain/entities/production-close-settings.js";
import { ProductionSettingsReader } from "../domain/ports/production-settings.reader.js";
import {
  HOUSE_SETTINGS_ID,
  settingsValuesOf,
} from "./prisma-production-close-settings.repository.js";

/** Les réglages du fournil en lecture — le schéma `production`, et lui seul. */
@Injectable()
export class PrismaProductionSettingsReader extends ProductionSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async closeSettings(): Promise<CloseSettingsValues | null> {
    const row = await this.prisma.productionSettings.findUnique({
      where: { id: HOUSE_SETTINGS_ID },
      select: { closeMode: true, closeAt: true, alertAt: true },
    });
    return row === null ? null : settingsValuesOf(row);
  }

  /** Deux jours ISO s'ordonnent comme des chaînes : le `gte` est juste sans fuseau. */
  async closedDaysFrom(from: string): Promise<readonly string[]> {
    const rows = await this.prisma.productionClosedDay.findMany({
      where: { serviceDay: { gte: from } },
      orderBy: { serviceDay: "asc" },
      select: { serviceDay: true },
    });
    return rows.map((row) => row.serviceDay);
  }
}
