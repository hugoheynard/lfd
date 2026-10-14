import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DayDispatchProgressReader } from "../../production/channels/delivery/index.js";

/**
 * « Une tournée de cette journée est-elle chargée ou partie ? » — implémente
 * le port que le fournil déclare pour refuser une réouverture (2026-10-14).
 *
 * Chargée : un chargement de bac encore posé (`loaded_at` non nul ; un
 * déchargement le remet à nul). Partie : un départ de tournée.
 */
@Injectable()
export class PrismaDayDispatchProgressReader extends DayDispatchProgressReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async startedOn(serviceDay: string): Promise<boolean> {
    const loaded = await this.prisma.deliveryBinLoad.count({
      where: { serviceDay, loadedAt: { not: null } },
    });
    if (loaded > 0) {
      return true;
    }
    const departed = await this.prisma.deliveryRound.count({
      where: { serviceDay, departedAt: { not: null } },
    });
    return departed > 0;
  }
}
