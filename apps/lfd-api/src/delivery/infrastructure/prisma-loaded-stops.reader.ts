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
}
