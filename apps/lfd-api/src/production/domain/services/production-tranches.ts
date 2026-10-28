import type { TrancheMode } from "../entities/production-tranche-settings.js";

/**
 * **Le rangement des besoins en tranches** (plan
 * `documentation/fournil/plan-tranches-de-production.md`, §2 et §3).
 *
 * Fonction pure, sans horloge ni base. Elle part des seuils que le commerce
 * calcule (une heure « prêt avant » par besoin) et les range selon le mode
 * réglé par l'atelier :
 *
 * - `computed` : rendus tels quels ;
 * - `fixed` : chaque besoin va dans la DERNIÈRE tranche fixe au plus tard à
 *   son heure — on arrondit toujours vers plus tôt, produire trop tard étant
 *   le seul vrai défaut (plan des vagues, §7.4). Un besoin d'avant la première
 *   tranche va dans la première, signalé (`before_first`, avec `earliest`).
 *   Les sans-échéance (`undated`) restent derniers. Un SKU sans heure (`day`,
 *   marges non réglées) reste tel quel. Aucune heure fixe : une seule
 *   tranche, la journée (§2.2) — aucune heure n'est inventée.
 */

/** Les sortes de seuil : celles du commerce, et `before_first` que seul le rangement produit. */
export type TrancheThresholdKind = "deadline" | "undated" | "day" | "before_first";

/** Un seuil tel que le commerce le rend — l'entrée du rangement. */
export interface DueNeed {
  readonly kind: "deadline" | "undated" | "day";
  /** `HH:mm`, seulement pour `deadline`. */
  readonly before: string | null;
  readonly quantity: number;
  readonly cumulative: number;
}

/** Un seuil rangé. */
export interface TrancheThreshold {
  readonly kind: TrancheThresholdKind;
  /** `HH:mm` pour `deadline` et `before_first` (la première tranche). */
  readonly before: string | null;
  readonly quantity: number;
  readonly cumulative: number;
  /** `before_first` seulement : l'heure du besoin le plus pressé. */
  readonly earliest?: string;
}

/** Les seuils d'un SKU — ceux du commerce en entrée, rangés en sortie. */
export interface SkuNeeds<T> {
  readonly sku: string;
  readonly productName: string;
  readonly total: number;
  readonly thresholds: readonly T[];
}

/** Les seuils rangés de chaque SKU, dans l'ordre reçu. `fixedTranches` : `HH:mm`, triées ici. */
export function rangeInTranches(
  lines: readonly SkuNeeds<DueNeed>[],
  mode: TrancheMode,
  fixedTranches: readonly string[],
): readonly SkuNeeds<TrancheThreshold>[] {
  const sorted = [...fixedTranches].sort();
  return lines.map((line) => ({
    sku: line.sku,
    productName: line.productName,
    total: line.total,
    thresholds: thresholdsOf(line, mode, sorted),
  }));
}

function thresholdsOf(
  line: SkuNeeds<DueNeed>,
  mode: TrancheMode,
  fixedTranches: readonly string[],
): readonly TrancheThreshold[] {
  const untimed = line.thresholds.some((need) => need.kind === "day");
  if (mode === "computed" || untimed) {
    return line.thresholds.map((need) => ({ ...need }));
  }
  if (fixedTranches.length === 0) {
    return line.total === 0
      ? []
      : [{ kind: "day", before: null, quantity: line.total, cumulative: line.total }];
  }
  return cumulate(bucketsOf(line.thresholds, fixedTranches));
}

interface Bucket {
  readonly kind: TrancheThresholdKind;
  readonly before: string | null;
  quantity: number;
  earliest?: string;
}

/** Un seau par tranche touchée, dans l'ordre : avant la première, les tranches, sans échéance. */
function bucketsOf(needs: readonly DueNeed[], fixedTranches: readonly string[]): readonly Bucket[] {
  const first = fixedTranches[0] ?? null;
  let early: Bucket | null = null;
  const byTranche = new Map<string, Bucket>();
  let undated: Bucket | null = null;
  for (const need of needs) {
    if (need.kind === "undated" || need.before === null) {
      undated ??= { kind: "undated", before: null, quantity: 0 };
      undated.quantity += need.quantity;
      continue;
    }
    const tranche = lastTrancheAtOrBefore(need.before, fixedTranches);
    if (tranche === null) {
      early ??= { kind: "before_first", before: first, quantity: 0, earliest: need.before };
      early.quantity += need.quantity;
      early.earliest = minClock(early.earliest ?? need.before, need.before);
      continue;
    }
    const bucket = byTranche.get(tranche) ?? { kind: "deadline", before: tranche, quantity: 0 };
    bucket.quantity += need.quantity;
    byTranche.set(tranche, bucket);
  }
  const ordered = fixedTranches.flatMap((time) => byTranche.get(time) ?? []);
  return [...(early === null ? [] : [early]), ...ordered, ...(undated === null ? [] : [undated])];
}

/** `HH:mm` zéro-paddé : l'ordre lexical est l'ordre des heures. */
function lastTrancheAtOrBefore(before: string, fixedTranches: readonly string[]): string | null {
  let found: string | null = null;
  for (const time of fixedTranches) {
    if (time <= before) {
      found = time;
    }
  }
  return found;
}

function minClock(a: string, b: string): string {
  return a <= b ? a : b;
}

function cumulate(buckets: readonly Bucket[]): readonly TrancheThreshold[] {
  let cumulative = 0;
  return buckets
    .filter((bucket) => bucket.quantity > 0)
    .map((bucket) => {
      cumulative += bucket.quantity;
      const base = {
        kind: bucket.kind,
        before: bucket.before,
        quantity: bucket.quantity,
        cumulative,
      };
      return bucket.earliest === undefined ? base : { ...base, earliest: bucket.earliest };
    });
}
