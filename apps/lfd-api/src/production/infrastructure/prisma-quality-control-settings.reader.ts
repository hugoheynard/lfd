import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { QualityControlSettings } from "../domain/entities/quality-control-settings.js";
import { QualityControlSettingsReader } from "../domain/ports/quality-control-settings.reader.js";
import { QUALITY_CONTROL_SETTINGS_KEY } from "./quality-control-settings.key.js";

/** Adaptateur Prisma de la lecture des réglages du contrôle qualité. */
@Injectable()
export class PrismaQualityControlSettingsReader extends QualityControlSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<QualityControlSettings | null> {
    const row = await this.prisma.productionQualitySettings.findUnique({
      where: { key: QUALITY_CONTROL_SETTINGS_KEY },
      select: { lineChecks: true, orderChecks: true },
    });
    return row === null ? null : QualityControlSettings.of(row);
  }
}
