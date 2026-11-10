import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplyUsedNames } from "../domain/resupply-used-names.js";

/**
 * Les noms déjà employés au point (le nom d'un réassort, R1g) : un regroupement
 * par nom, rangé par son envoi le plus récent ; un nom qui ne vit encore que
 * sur une demande en cours (jamais envoyée) passe devant — Postgres range
 * `NULL` en tête d'un tri décroissant. Brouillons et annulés compris : un nom
 * posé a été employé.
 *
 * Rangé par `placed_at`, plus par l'identifiant : depuis la clé d'envoi du
 * fournil (2026-11-02), l'identifiant d'un réassort est la clé que l'écran
 * tire, plus un ULID ordonné par le temps.
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
      _max: { placedAt: true },
      orderBy: { _max: { placedAt: "desc" } },
      take: limit,
    });
    return groups.flatMap((group) => (group.name === null ? [] : [group.name]));
  }
}
