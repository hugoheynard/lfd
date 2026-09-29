import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { RoutingSettingsReader } from "../domain/ports/routing-settings.reader.js";
import { InvalidRoutingSettingError } from "../domain/errors/delivery-routing-errors.js";
import { isProposalMode, RoutingSettings } from "../domain/value-objects/routing-settings.js";
import { ROUTING_SETTINGS_KEY } from "./routing-settings.key.js";

/**
 * Adaptateur Prisma de la lecture des réglages du calcul. La ligne se
 * réhydrate par le value object : une valeur hors bornes en base lève, plutôt
 * que de calculer sur une vitesse absurde.
 */
@Injectable()
export class PrismaRoutingSettingsReader extends RoutingSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<RoutingSettings | null> {
    const row = await this.prisma.deliveryRoutingSettings.findUnique({
      where: { key: ROUTING_SETTINGS_KEY },
      select: {
        detourPercent: true,
        averageSpeedKmh: true,
        earliestDeparture: true,
        maxRoundMinutes: true,
        stopMinutes: true,
        defaultMode: true,
        multiplePassages: true,
      },
    });
    if (row === null) {
      return null;
    }
    const { defaultMode } = row;
    if (!isProposalMode(defaultMode)) {
      throw new InvalidRoutingSettingError(
        `mode de proposition inconnu en base (« ${defaultMode} »).`,
      );
    }
    return RoutingSettings.define({ ...row, defaultMode });
  }
}
