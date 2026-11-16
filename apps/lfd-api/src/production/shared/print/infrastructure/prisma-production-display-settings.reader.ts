import { PRODUCTION_GROUPINGS, type ProductionGrouping } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { ProductionDisplaySettings } from "../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsReader } from "../domain/ports/production-display-settings.reader.js";
import { PRODUCTION_DISPLAY_SETTINGS_KEY } from "./production-display-settings.key.js";

/** Un rangement que le CHECK de la base aurait dû refuser. */
class UnknownProductionGroupingError extends TechnicalError {
  constructor(raw: string) {
    super(
      "production.display_settings.unknown_grouping",
      `Le réglage du rangement du fournil vaut « ${raw} », que le serveur ne connaît pas : vérifiez la contrainte de la table production_display_settings.`,
    );
  }
}

function groupingFrom(raw: string): ProductionGrouping {
  const known = PRODUCTION_GROUPINGS.find((grouping) => grouping === raw);
  if (known === undefined) {
    throw new UnknownProductionGroupingError(raw);
  }
  return known;
}

/** Adaptateur Prisma de la lecture du rangement du fournil. */
@Injectable()
export class PrismaProductionDisplaySettingsReader extends ProductionDisplaySettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<ProductionDisplaySettings | null> {
    const row = await this.prisma.productionDisplaySettings.findUnique({
      where: { key: PRODUCTION_DISPLAY_SETTINGS_KEY },
      select: { showSubcategories: true, grouping: true },
    });
    return row === null
      ? null
      : ProductionDisplaySettings.of({
          showSubcategories: row.showSubcategories,
          grouping: groupingFrom(row.grouping),
        });
  }
}
