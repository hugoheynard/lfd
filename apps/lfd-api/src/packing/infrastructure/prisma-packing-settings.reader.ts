import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingSettings } from "../domain/entities/packing-settings.js";
import { PackingSettingsReader } from "../domain/ports/packing-settings.reader.js";
import { PACKING_SETTINGS_KEY } from "./packing-settings.key.js";

/** Adaptateur Prisma de la lecture des réglages du colisage. */
@Injectable()
export class PrismaPackingSettingsReader extends PackingSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<PackingSettings | null> {
    const row = await this.prisma.packingSettings.findUnique({
      where: { key: PACKING_SETTINGS_KEY },
      select: { halfSharing: true },
    });
    return row === null ? null : PackingSettings.of({ halfSharing: row.halfSharing });
  }
}
