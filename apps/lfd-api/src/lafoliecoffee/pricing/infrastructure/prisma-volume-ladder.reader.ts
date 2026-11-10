import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { inForceFor } from "../domain/specificity.js";
import { PRICING_CACHE_KEYS, PricingMaterialsCache } from "./pricing-materials.cache.js";
import { VolumeLadderReader } from "../domain/ports/volume-ladder.reader.js";
import { ladderFromRow } from "./volume-ladder-rows.js";
import type { PricingScopes } from "../domain/pricing-scopes.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";

@Injectable()
export class PrismaVolumeLadderReader extends VolumeLadderReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  /**
   * Élague sur ce que SQL sait faire — archivage, fenêtre, portée, audience — et
   * laisse au domaine le palier et la spécificité. Une lecture large qui rend
   * deux barèmes de trop est sans conséquence ; une lecture étroite qui en
   * oublie un facture le mauvais prix.
   */
  async inScopes(scopes: PricingScopes): Promise<VolumeLadder[]> {
    // La table entière, gardée entre deux écritures, puis triée par fenêtre et
    // par audience ici — cf. `pricing-materials.cache.ts`. La portée est rejugée
    // par l'index de `pricing-materials.ts`.
    const all = await this.cache.of(PRICING_CACHE_KEYS.ladders, () => this.unarchived());
    return inForceFor(all, scopes);
  }

  /** Tous les barèmes vivants — l'unique lecture que le cache retient. */
  private async unarchived(): Promise<VolumeLadder[]> {
    const rows = await this.prisma.volumeLadder.findMany({ where: { archivedAt: null } });
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
