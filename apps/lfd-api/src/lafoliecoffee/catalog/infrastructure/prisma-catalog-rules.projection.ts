import { Injectable } from "@nestjs/common";
import type { SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogRulesProjection } from "../domain/ports/catalog-rules.projection.js";
import { ORDER_TIME_LIMITS_KIND } from "./prisma-catalog-order-limits.js";

/**
 * L'adaptateur du récepteur des règles globales (lot 2b) : une écriture
 * conditionnée sur `applied_seq`, en une instruction — comme les familles et
 * les fiches. Un fait plus ancien que l'échelle tenue n'écrit rien.
 */
@Injectable()
export class PrismaCatalogRulesProjection extends CatalogRulesProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordOrderTimeLimitsIfNewer(
    rules: readonly SyncOrderTimeLimitRule[],
    seq: number,
    receivedAt: Date,
  ): Promise<boolean> {
    const written = await this.prisma.$executeRaw`
      INSERT INTO public.catalog_rules (kind, rules, applied_seq, received_at)
      VALUES (${ORDER_TIME_LIMITS_KIND}, ${JSON.stringify(rules)}::jsonb, ${seq}, ${receivedAt})
      ON CONFLICT (kind) DO UPDATE SET
        rules = EXCLUDED.rules,
        applied_seq = EXCLUDED.applied_seq,
        received_at = EXCLUDED.received_at
      WHERE public.catalog_rules.applied_seq < EXCLUDED.applied_seq`;
    return written > 0;
  }
}
