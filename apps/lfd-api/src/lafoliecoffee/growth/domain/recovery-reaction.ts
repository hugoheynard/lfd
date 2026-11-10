import type {
  BoxplotSummary,
  RecoveryReactionByWeek,
  RecoveryReactionSeries,
  RecoveryReactionStat,
} from "@lfd/contracts";

import { weekStart } from "./growth-stats.js";
import { normalizeReason, REASONS } from "./termination-taxonomy.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sous ce nombre d'échantillons, une boîte est dégénérée : on n'affiche pas la catégorie. */
const MIN_SAMPLES = 3;

/** Une ligne de terminaison utile au délai de réaction (tentative → action). */
export interface ReactionRow {
  readonly reason: string;
  readonly outcome: string;
  readonly createdAt: string;
  /** Instant de l'action qui a rattrapé (ISO), `null` si non rattrapée. */
  readonly resolvedAt: string | null;
}

/**
 * **Délai de réaction au churn par catégorie** : pour chaque catégorie de départ, la
 * distribution (en jours) du temps entre la déclaration de résiliation et l'action
 * qui l'a rattrapée. Boîte basse = on sauve vite ; outlier haut = sauvetage qui a
 * traîné. Catégories sous `MIN_SAMPLES` rattrapages exclues (boîte non fiable).
 */
export function buildRecoveryReaction(rows: readonly ReactionRow[]): RecoveryReactionStat[] {
  const byReason = new Map<string, number[]>();
  for (const row of rows) {
    if (row.outcome !== "recovered" || row.resolvedAt === null) {
      continue;
    }
    const reason = normalizeReason(row.reason);
    const days = (new Date(row.resolvedAt).getTime() - new Date(row.createdAt).getTime()) / DAY_MS;
    const bucket = byReason.get(reason) ?? [];
    bucket.push(Math.max(0, Math.round(days * 10) / 10));
    byReason.set(reason, bucket);
  }
  const stats: RecoveryReactionStat[] = [];
  for (const r of REASONS) {
    const values = byReason.get(r.reason);
    if (values === undefined || values.length < MIN_SAMPLES) {
      continue;
    }
    stats.push({ reason: r.reason, label: r.label, count: values.length, box: boxplot(values) });
  }
  return stats;
}

/**
 * **Délai de réaction hebdo × catégorie** : pour chaque catégorie ayant assez de
 * rattrapages, une boîte par semaine (alignée sur l'union triée des semaines). Rendu
 * groupé (les catégories côte à côte dans chaque semaine). Case vide → boîte `null`.
 */
export function buildRecoveryReactionByWeek(rows: readonly ReactionRow[]): RecoveryReactionByWeek {
  const byReasonWeek = new Map<string, Map<string, number[]>>();
  const weekSet = new Set<string>();
  for (const row of rows) {
    if (row.outcome !== "recovered" || row.resolvedAt === null) {
      continue;
    }
    const reason = normalizeReason(row.reason);
    const week = weekStart(new Date(row.createdAt));
    const days = (new Date(row.resolvedAt).getTime() - new Date(row.createdAt).getTime()) / DAY_MS;
    const weeks = byReasonWeek.get(reason) ?? new Map<string, number[]>();
    const bucket = weeks.get(week) ?? [];
    bucket.push(Math.max(0, Math.round(days * 10) / 10));
    weeks.set(week, bucket);
    byReasonWeek.set(reason, weeks);
    weekSet.add(week);
  }
  const weeks = [...weekSet].sort((a, b) => a.localeCompare(b));
  const series: RecoveryReactionSeries[] = [];
  for (const r of REASONS) {
    const perWeek = byReasonWeek.get(r.reason);
    if (perWeek === undefined) {
      continue;
    }
    const total = [...perWeek.values()].reduce((sum, arr) => sum + arr.length, 0);
    if (total < MIN_SAMPLES) {
      continue;
    }
    const cells = weeks.map((w) => {
      const vals = perWeek.get(w) ?? [];
      return { weekStart: w, count: vals.length, box: vals.length > 0 ? boxplot(vals) : null };
    });
    series.push({ reason: r.reason, label: r.label, cells });
  }
  return { weeks, series };
}

/** Résumé boxplot : quartiles, moustaches de Tukey (1,5·IQR) et points aberrants. */
function boxplot(raw: readonly number[]): BoxplotSummary {
  const values = [...raw].sort((a, b) => a - b);
  const q1 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  const inliers = values.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  const outliers = values.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
  return {
    low: inliers[0] ?? values[0] ?? 0,
    q1,
    median,
    q3,
    high: inliers[inliers.length - 1] ?? values[values.length - 1] ?? 0,
    outliers,
  };
}

/** Quantile `p` (0..1) d'une série TRIÉE, interpolation linéaire. */
function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[Math.ceil(idx)] ?? loVal;
  return loVal + (hiVal - loVal) * (idx - lo);
}
