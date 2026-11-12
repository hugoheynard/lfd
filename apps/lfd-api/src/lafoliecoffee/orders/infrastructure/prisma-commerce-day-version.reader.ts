import { Injectable } from "@nestjs/common";

import { CommerceDayVersionReader } from "../../../delivery/channels/commerce/index.js";
import { journalVersion } from "../../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **La version d'une journée du commerce, relayée à la livraison** — l'adaptateur
 * de `CommerceDayVersionReader` (`parcours-du-livreur.md`, PL4) : `max(id)` et `count(*)` de
 * `public.day_change` pour ce jour, la même lecture que `PrismaOrderDayVersionReader`.
 * Un parcours d'index ; aucun mur de société — le journal ne porte que des jours.
 */
@Injectable()
export class PrismaCommerceDayVersionReader extends CommerceDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(day: string): Promise<number> {
    const found = await this.prisma.orderDayChange.aggregate({
      where: { serviceDay: day },
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
