import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { LoadedStopsReader } from "../domain/ports/loaded-stops.reader.js";

/** Un arrêt a-t-il un sac chargé ? Lecture sans verrou : `saveMove` revérifie sous verrou. */
@Injectable()
export class PrismaLoadedStopsReader extends LoadedStopsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasLoadedBag(stopId: string): Promise<boolean> {
    const found = await this.prisma.deliveryBagLoad.findFirst({
      where: { stopId, loadedAt: { not: null } },
      select: { id: true },
    });
    return found !== null;
  }

  async loadedAmong(stopIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (stopIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.deliveryBagLoad.findMany({
      where: { stopId: { in: [...stopIds] }, loadedAt: { not: null } },
      select: { stopId: true },
      distinct: ["stopId"],
    });
    return new Set(rows.map((row) => row.stopId));
  }
}
