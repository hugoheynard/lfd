import type {
  AudienceCell,
  AudienceDimension,
  AudienceSegmentation,
  AudienceTopFamily,
} from "@lfd/contracts";

import { hasEnoughClients } from "../audience-anonymity.js";
import { AUDIENCE_DIMENSION_RULES, type DimensionCell } from "../audience-dimensions.js";
import type { AudienceFamily } from "../ports/audience-family.reader.js";
import type { AudienceSkuRevenue, AudienceTally } from "../ports/audience-order.reader.js";

/** Les familles en tête d'une case : trois, pas plus. */
export const TOP_FAMILIES_PER_CELL = 3;

/** Le nom d'un article dont le catalogue ne connaît plus la famille. */
export const UNKNOWN_FAMILY_NAME = "Famille inconnue";

/** Les totaux d'une case, une fois ses clés brutes regroupées. */
export interface CellTotals {
  readonly clients: number;
  readonly orders: number;
  readonly revenueHtCents: number;
  readonly revenueTtcCents: number;
}

/**
 * **Une case présentée** : ses chiffres si elle compte assez de clients
 * distincts, son nom seul sinon — ni zéro, ni familles. Une case absente de
 * la base (`totals` nul) est une case sans client : masquée elle aussi.
 */
export function presentCell(
  cell: DimensionCell,
  totals: CellTotals | null,
  topFamilies: readonly AudienceTopFamily[],
): AudienceCell {
  if (totals === null || !hasEnoughClients(totals.clients)) {
    return { status: "too_few_clients", key: cell.key, label: cell.label };
  }
  return {
    status: "shown",
    key: cell.key,
    label: cell.label,
    // Champ par champ, jamais `...totals` : une ligne brute de la base porte
    // aussi sa clé (un code NAF), qui ne doit pas sortir.
    clients: totals.clients,
    orders: totals.orders,
    revenueHtCents: totals.revenueHtCents,
    revenueTtcCents: totals.revenueTtcCents,
    averageBasketHtCents: Math.round(totals.revenueHtCents / totals.orders),
    averageBasketTtcCents: Math.round(totals.revenueTtcCents / totals.orders),
    topFamilies,
  };
}

/**
 * Les familles qui pèsent le plus dans un ensemble de lignes, par CA HT —
 * puis par nom, pour qu'un ex-aequo se range toujours pareil.
 */
export function topFamiliesOf(
  revenues: readonly AudienceSkuRevenue[],
  families: ReadonlyMap<string, AudienceFamily>,
): readonly AudienceTopFamily[] {
  const byFamily = new Map<string, AudienceTopFamily>();
  for (const revenue of revenues) {
    const family = families.get(revenue.sku) ?? null;
    const id = family?.id ?? null;
    const slot = id ?? "";
    const known = byFamily.get(slot);
    byFamily.set(slot, {
      familyId: id,
      name: family?.name ?? UNKNOWN_FAMILY_NAME,
      revenueHtCents: (known?.revenueHtCents ?? 0) + revenue.revenueHtCents,
    });
  }
  return [...byFamily.values()]
    .sort((a, b) => b.revenueHtCents - a.revenueHtCents || a.name.localeCompare(b.name, "fr"))
    .slice(0, TOP_FAMILIES_PER_CELL);
}

/** Additionne deux totaux — cf. la règle d'addition de `AudienceDimensionRule`. */
function addTotals(a: CellTotals | undefined, b: AudienceTally): CellTotals {
  return {
    clients: (a?.clients ?? 0) + b.clients,
    orders: (a?.orders ?? 0) + b.orders,
    revenueHtCents: (a?.revenueHtCents ?? 0) + b.revenueHtCents,
    revenueTtcCents: (a?.revenueTtcCents ?? 0) + b.revenueTtcCents,
  };
}

/**
 * **Une coupe entière** : les lignes brutes de la base regroupées en cases,
 * les familles en tête attachées, le seuil appliqué.
 *
 * Ordre : les cases fixes de la coupe d'abord, dans leur ordre ; puis les
 * cases ouvertes (sites, zones) par libellé — jamais par volume, qui
 * laisserait deviner la taille d'une case masquée.
 */
export function buildSegmentation(
  dimension: AudienceDimension,
  tallies: readonly AudienceTally[],
  skuRevenues: readonly AudienceSkuRevenue[],
  families: ReadonlyMap<string, AudienceFamily>,
): AudienceSegmentation {
  const rule = AUDIENCE_DIMENSION_RULES[dimension];
  const cells = new Map<string, DimensionCell>(rule.canonical.map((cell) => [cell.key, cell]));
  const totals = new Map<string, CellTotals>();
  for (const tally of tallies) {
    const cell = rule.cellOf(tally.rawKey, tally.rawLabel);
    cells.set(cell.key, cells.get(cell.key) ?? cell);
    totals.set(cell.key, addTotals(totals.get(cell.key), tally));
  }
  const revenuesByCell = new Map<string, AudienceSkuRevenue[]>();
  for (const revenue of skuRevenues) {
    const key = rule.cellOf(revenue.rawKey, null).key;
    revenuesByCell.set(key, [...(revenuesByCell.get(key) ?? []), revenue]);
  }
  const canonicalKeys = new Set(rule.canonical.map((cell) => cell.key));
  const open = [...cells.values()]
    .filter((cell) => !canonicalKeys.has(cell.key))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return {
    dimension,
    cells: [...rule.canonical, ...open].map((cell) =>
      presentCell(
        cell,
        totals.get(cell.key) ?? null,
        topFamiliesOf(revenuesByCell.get(cell.key) ?? [], families),
      ),
    ),
  };
}
