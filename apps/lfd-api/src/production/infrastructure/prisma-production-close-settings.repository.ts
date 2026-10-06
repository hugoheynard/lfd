import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type CloseMode,
  type CloseSettingsValues,
  ProductionCloseSettings,
} from "../domain/entities/production-close-settings.js";
import {
  CorruptCloseSettingsError,
  UnauthoredCloseSettingsError,
} from "../domain/errors/production-settings-errors.js";
import { ProductionCloseSettingsRepository } from "../domain/ports/production-close-settings.repository.js";

/** L'identifiant de la seule ligne — la base refuse tout autre (`production_settings_single_row_check`). */
export const HOUSE_SETTINGS_ID = "house";

interface SettingsRow {
  readonly closeMode: string;
  readonly closeAt: string | null;
  readonly alertAt: string | null;
}

/** Les valeurs d'une ligne ; un mode inconnu est une panne, pas un défaut. */
export function settingsValuesOf(row: SettingsRow): CloseSettingsValues {
  return { mode: closeModeOf(row.closeMode), closeAt: row.closeAt, alertAt: row.alertAt };
}

function closeModeOf(raw: string): CloseMode {
  if (raw === "auto" || raw === "manual") {
    return raw;
  }
  throw new CorruptCloseSettingsError(raw);
}

/** Le réglage d'arrêt, dans `production.production_settings` — une ligne au plus. */
@Injectable()
export class PrismaProductionCloseSettingsRepository extends ProductionCloseSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<ProductionCloseSettings | null> {
    const row = await this.prisma.productionSettings.findUnique({
      where: { id: HOUSE_SETTINGS_ID },
    });
    if (row === null) {
      return null;
    }
    return ProductionCloseSettings.restore({
      ...settingsValuesOf(row),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    });
  }

  async save(settings: ProductionCloseSettings): Promise<void> {
    const { updatedBy, updatedAt } = settings;
    // L'agrégat ne se sauve qu'après un changement, qui pose toujours son auteur.
    if (updatedBy === null || updatedAt === null) {
      throw new UnauthoredCloseSettingsError();
    }
    const data = {
      closeMode: settings.values.mode,
      closeAt: settings.values.closeAt,
      alertAt: settings.values.alertAt,
      updatedBy,
      updatedAt,
    };
    await this.prisma.productionSettings.upsert({
      where: { id: HOUSE_SETTINGS_ID },
      create: { id: HOUSE_SETTINGS_ID, ...data },
      update: data,
    });
  }
}
