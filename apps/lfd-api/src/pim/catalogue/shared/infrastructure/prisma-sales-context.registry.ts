import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";
import type { SalesChannelKey, SalesContext } from "../domain/value-objects/sales-context.js";
import { bootstrapRootContext } from "../domain/value-objects/bootstrap-contexts.js";

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
  readonly perLocation: boolean;
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
    perLocation: row.perLocation,
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
    return this.read({ active: true });
  }

  async all(): Promise<readonly SalesContext[]> {
    return this.read({});
  }

  /**
   * Sème le contexte racine s'il manque. **Idempotent** : deux boots
   * simultanés ne peuvent pas en créer deux, `key` étant unique — le second
   * ne fait rien plutôt que d'échouer.
   *
   * `update: {}` et non un `update` qui réécrirait les colonnes : la racine est
   * ineffaçable, pas immuable. Son libellé, sa position et son état de service
   * restent réglables, et le boot n'a pas à les repousser à leur valeur d'usine
   * toutes les nuits.
   */
  async ensureRootContext(): Promise<void> {
    const root = bootstrapRootContext();
    await this.prisma.salesContext.upsert({
      where: { key: root.key },
      update: {},
      create: { id: `ctx_${root.key}`, ...root },
    });
  }

  /** Compté en base — `location_context` existe précisément pour ça. */
  async offeredByLocations(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.locationContext.groupBy({
      by: ["contextKey"],
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.contextKey, row._count._all]));
  }

  private async read(where: { active?: boolean }): Promise<readonly SalesContext[]> {
    const rows = await this.prisma.salesContext.findMany({
      where,
      orderBy: { position: "asc" },
    });
    return rows.map(toContext).filter((context) => context !== null);
  }
}
