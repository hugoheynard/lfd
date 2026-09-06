import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VolumeLadderReader } from "../domain/ports/volume-ladder.reader.js";
import { ladderFromRow } from "./volume-ladder-rows.js";
import { scopeFilter } from "./scope-filter.js";
import type { PricingScopes } from "../domain/pricing-scopes.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";

@Injectable()
export class PrismaVolumeLadderReader extends VolumeLadderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Élague sur ce que SQL sait faire — archivage, fenêtre, portée, audience — et
   * laisse au domaine le palier et la spécificité. Une lecture large qui rend
   * deux barèmes de trop est sans conséquence ; une lecture étroite qui en
   * oublie un facture le mauvais prix.
   */
  /** Même sélection que les règles : fenêtre, audience, portée — cf. `scopeFilter`. */
  async inScopes(scopes: PricingScopes): Promise<VolumeLadder[]> {
    const rows = await this.prisma.volumeLadder.findMany({
      where: {
        archivedAt: null,
        validFrom: { lte: scopes.at },
        OR: [{ validTo: null }, { validTo: { gt: scopes.at } }],
        AND: [{ OR: scopeFilter(scopes) }, { OR: audienceFilter(scopes) }],
      },
    });
    return rows.map(ladderFromRow);
  }

  /** Tout ce qui est posé, suspendu compris — l'écran doit pouvoir le rouvrir. */
  async listAll(at: Date): Promise<VolumeLadder[]> {
    const rows = await this.prisma.volumeLadder.findMany({
      where: { OR: [{ archivedAt: null }, { archivedAt: { gt: at } }] },
      orderBy: { validFrom: "asc" },
    });
    return rows.map(ladderFromRow);
  }
}

/**
 * Une commande **sans entreprise** (parcours zéro friction) ne prend que les
 * barèmes ouverts à tous : demander `audience_id = NULL` à Postgres ne
 * correspondrait jamais, et ferait passer le barème pour absent au lieu
 * d'inapplicable.
 */
function audienceFilter(scopes: PricingScopes): { audienceType: string; audienceId?: string }[] {
  const clauses: { audienceType: string; audienceId?: string }[] = [{ audienceType: "all" }];
  if (scopes.segmentId !== null) {
    clauses.push({ audienceType: "segment", audienceId: scopes.segmentId });
  }
  if (scopes.companyId !== null) {
    clauses.push({ audienceType: "company", audienceId: scopes.companyId });
  }
  return clauses;
}
