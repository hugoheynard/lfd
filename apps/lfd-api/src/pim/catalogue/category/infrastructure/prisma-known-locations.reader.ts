import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { KnownLocationsReader } from "../domain/ports/known-locations.reader.js";

@Injectable()
export class PrismaKnownLocationsReader extends KnownLocationsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Une seule requête, et seulement sur les identifiants demandés : un preset
   * en cite une poignée, pas le référentiel entier.
   */
  async existing(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.location.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
