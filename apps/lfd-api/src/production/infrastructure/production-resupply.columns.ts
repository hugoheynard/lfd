import type {
  LaunchedResupplySnapshot,
  ProductionResupplySnapshot,
} from "../domain/entities/production-day.js";

/** Les deux genres admis par le CHECK `production_resupply_kind_known`. */
const EVENING_KIND = "evening";
const ASAP_KIND = "asap";

/**
 * Les colonnes d'un réassort au plan (`production_resupply`) et leurs deux
 * mappers. Un seul tableau pour deux genres (R4a) : `evening`, figé à
 * l'arrêt du soir, et `asap`, lancé dans la journée — que le CHECK
 * `production_resupply_asap_launched` lie à son lancement.
 */
export const RESUPPLY_COLUMNS = {
  select: {
    resupplyId: true,
    siteId: true,
    siteLabel: true,
    name: true,
    servedByTransfer: true,
    kind: true,
    launchedAt: true,
    launchedBy: true,
    lines: { select: { sku: true, productName: true, quantity: true } },
  },
  orderBy: { resupplyId: "asc" },
} as const;

/** Une ligne de `production_resupply` telle que `RESUPPLY_COLUMNS` la rend. */
interface ResupplyRow {
  readonly resupplyId: string;
  readonly siteId: string;
  readonly siteLabel: string | null;
  readonly name: string | null;
  readonly servedByTransfer: boolean;
  readonly kind: string;
  readonly launchedAt: Date | null;
  readonly launchedBy: string | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
  }[];
}

/** Ce que la journée range à part : les réassorts du soir, et les lancés. */
export interface SplitResupplies {
  readonly resupplies: readonly ProductionResupplySnapshot[];
  readonly launchedResupplies: readonly LaunchedResupplySnapshot[];
}

/**
 * Ligne → réassorts de la journée, rangés par genre. Le lancement se lit
 * sur ses deux colonnes : la base les tient ensemble et les réserve aux
 * `asap` (CHECK), donc une ligne lancée est une ligne « au plus tôt ».
 */
export function splitResupplies(rows: readonly ResupplyRow[]): SplitResupplies {
  const resupplies: ProductionResupplySnapshot[] = [];
  const launchedResupplies: LaunchedResupplySnapshot[] = [];
  for (const row of rows) {
    const resupply: ProductionResupplySnapshot = {
      resupplyId: row.resupplyId,
      siteId: row.siteId,
      siteLabel: row.siteLabel,
      name: row.name,
      servedByTransfer: row.servedByTransfer,
      // Un réassort est toujours à la pièce : le commerce refuse un article au
      // poids au réassort (plan `pricing/vente-au-poids.md`, § 2).
      lines: row.lines.map((line) => ({ ...line, saleUnit: "piece" })),
    };
    if (row.launchedAt === null || row.launchedBy === null) {
      resupplies.push(resupply);
    } else {
      launchedResupplies.push({
        ...resupply,
        launched: { at: row.launchedAt, by: row.launchedBy },
      });
    }
  }
  return { resupplies, launchedResupplies };
}

/** Réassort → colonnes à écrire, genre et lancement compris. */
export function resupplyRowOf(resupply: ProductionResupplySnapshot | LaunchedResupplySnapshot) {
  const launched = "launched" in resupply ? resupply.launched : null;
  return {
    resupplyId: resupply.resupplyId,
    siteId: resupply.siteId,
    siteLabel: resupply.siteLabel,
    name: resupply.name,
    servedByTransfer: resupply.servedByTransfer,
    kind: launched === null ? EVENING_KIND : ASAP_KIND,
    launchedAt: launched?.at ?? null,
    launchedBy: launched?.by ?? null,
    lines: {
      create: resupply.lines.map((line) => ({
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
      })),
    },
  };
}
