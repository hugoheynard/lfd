import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";
import type { SalesChannelKey, SalesContext } from "../domain/value-objects/sales-context.js";

/** Les canaux que la matrice sait porter — le mur du `channel_key` en base. */
const CHANNEL_KEYS: readonly SalesChannelKey[] = ["emporter", "surPlace", "b2b"];

function isChannelKey(value: string): value is SalesChannelKey {
  return CHANNEL_KEYS.some((key) => key === value);
}

interface SalesContextRow {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly handleSuffix: string;
  readonly channelKey: string;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
  readonly position: number;
}

/**
 * `null` quand la ligne désigne un canal que ce code ne connaît pas : elle
 * viendrait d'une migration plus récente que le binaire en service. L'écarter
 * est le seul choix sûr — lui prêter un canal par défaut ferait facturer un
 * contexte que personne ne peut vendre.
 */
function toContext(row: SalesContextRow): SalesContext | null {
  if (!isChannelKey(row.channelKey)) {
    return null;
  }
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    handleSuffix: row.handleSuffix,
    channelKey: row.channelKey,
    active: row.active,
    shopifyProjected: row.shopifyProjected,
    position: row.position,
  };
}

@Injectable()
export class PrismaSalesContextRegistry extends SalesContextRegistry {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async active(): Promise<readonly SalesContext[]> {
    const rows = await this.prisma.salesContext.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    });
    return rows.map(toContext).filter((context) => context !== null);
  }
}
