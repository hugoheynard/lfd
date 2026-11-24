import { Injectable } from "@nestjs/common";

import { CommerceDayVersionReader } from "../../../production/channels/commerce/index.js";
import type { ServiceDay } from "../../../production/channels/commerce/index.js";
import { journalVersion } from "../../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **La version d'une journée du commerce, relayée au fournil** — l'adaptateur
 * de `CommerceDayVersionReader` (
 * `documentation/fournil/dossier-prod-du-jour.md`) : `max(id)` et
 * `count(*)` de `public.day_change` pour ce jour, la requête même que
 * `PrismaCommerceDayVersionReader` sert à la livraison. Un parcours d'index ;
 * aucun mur de société — le journal ne porte que des jours.
 */
@Injectable()
export class ProductionCommerceDayVersionReader extends CommerceDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(day: ServiceDay): Promise<number> {
    const found = await this.prisma.orderDayChange.aggregate({
      where: { serviceDay: day.value },
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
