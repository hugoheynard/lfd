import { Injectable, Logger } from "@nestjs/common";
import type { NodeReading } from "@lfd/ops-contract";

import { PrismaService } from "../../platform/database/prisma.service.js";

/** Ce que Postgres rend pour une base : deux entiers, pas une ligne de plus. */
interface DatabaseFacts {
  readonly connections: bigint;
  readonly bytes: bigint;
}

/**
 * **Ce que la base sait dire d'elle-même.**
 *
 * Deux faits seulement, et choisis pour ce qu'ils annoncent :
 *
 * - **les connexions ouvertes**, parce que c'est la ressource qui manque en
 *   premier. Chaque instance a son pool ; le jour où `max_instances` remonte,
 *   c'est ce chiffre qui butera contre `max_connections` avant tout le reste —
 *   et il buterait sans prévenir, par un timeout côté application ;
 * - **la taille**, parce qu'elle ne redescend jamais toute seule et qu'on la
 *   découvre d'ordinaire par une facture.
 *
 * Ce n'est PAS de la télémétrie Prisma : le client n'expose ses compteurs que
 * derrière un drapeau de préversion, et l'activer pour deux chiffres qu'un
 * `SELECT` donne déjà serait payer un risque de génération pour rien.
 */
@Injectable()
export class DatabaseReadingsReader {
  private readonly logger = new Logger(DatabaseReadingsReader.name);

  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<readonly NodeReading[]> {
    try {
      const [facts] = await this.prisma.$queryRaw<DatabaseFacts[]>`
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections,
          pg_database_size(current_database()) AS bytes
      `;
      if (facts === undefined) {
        return [];
      }
      return [
        {
          label: "Connexions",
          value: Number(facts.connections),
          hint: "Sessions ouvertes sur cette base. C'est la ressource qui manque en premier.",
        },
        {
          label: "Taille",
          value: Math.round(Number(facts.bytes) / 1024 / 1024),
          unit: "Mo",
          hint: "Elle ne redescend pas toute seule.",
        },
      ];
    } catch (error) {
      // Une carte de santé n'a pas le droit de tomber avec ce qu'elle observe.
      // Sans relevé, le nœud reste affiché — muet, et c'est une information.
      this.logger.warn("Relevés de base indisponibles", error);
      return [];
    }
  }
}
