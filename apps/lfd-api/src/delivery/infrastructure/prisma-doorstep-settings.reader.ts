import { type DoorstepRule, doorstepRuleSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DoorstepSettingsReader } from "../domain/ports/doorstep-settings.reader.js";
import { DOORSTEP_SETTINGS_KEY } from "./doorstep-settings.key.js";

/**
 * Adaptateur Prisma de la lecture du réglage global à la porte. Un CHECK
 * tient la valeur en base : une autre lève plutôt que d'être devinée.
 */
@Injectable()
export class PrismaDoorstepSettingsReader extends DoorstepSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<DoorstepRule | null> {
    const row = await this.prisma.deliveryDoorstepSettings.findUnique({
      where: { key: DOORSTEP_SETTINGS_KEY },
      select: { rule: true },
    });
    return row === null ? null : doorstepRuleSchema.parse(row.rule);
  }
}
