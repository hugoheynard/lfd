import { Injectable } from "@nestjs/common";

import { CommerceDayVersionReader } from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **La version d'une journée du commerce, relayée à la livraison** — l'adaptateur
 * de `CommerceDayVersionReader` (`parcours-du-livreur.md`, PL4) : `max(id)` de
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
    });
    return found._max.id === null ? 0 : Number(found._max.id);
  }
}
