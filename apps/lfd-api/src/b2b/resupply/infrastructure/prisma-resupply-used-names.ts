import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplyUsedNames } from "../domain/resupply-used-names.js";

/**
 * Les noms déjà employés au point (R1g) : un regroupement par nom, rangé par
 * l'identifiant le plus récent de chacun — un ULID, triable par le temps.
 * Brouillons et annulés compris : un nom posé a été employé.
 */
@Injectable()
export class PrismaResupplyUsedNames extends ResupplyUsedNames {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async usedAt(siteId: string, limit: number): Promise<readonly string[]> {
    const groups = await this.prisma.siteResupply.groupBy({
      by: ["name"],
      where: { siteId, name: { not: null } },
      _max: { id: true },
      orderBy: { _max: { id: "desc" } },
      take: limit,
    });
    return groups.flatMap((group) => (group.name === null ? [] : [group.name]));
  }
}
