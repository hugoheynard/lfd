import type { TerminationReason, TerminationRecovery, TerminationStatsView } from "@lfd/contracts";

/** Ligne brute d'une terminaison (lecture). */
export interface TerminationRow {
  readonly reason: string;
  readonly outcome: string;
}

/** Ordre + libellés FR des catégories (v1 en dur ; référentiel « activité »-like plus tard). */
const REASONS: ReadonlyArray<{ reason: TerminationReason; label: string }> = [
  { reason: "price", label: "Tarif" },
  { reason: "competitor", label: "Concurrent" },
  { reason: "closure", label: "Cessation d'activité" },
  { reason: "quality", label: "Qualité / service" },
  { reason: "no_need", label: "Plus de besoin" },
  { reason: "unresponsive", label: "Injoignable" },
  { reason: "other", label: "Autre" },
];

const LABEL = new Map<TerminationReason, string>(REASONS.map((r) => [r.reason, r.label]));

/**
 * **Analytics de churn** (pure) : à partir des terminaisons brutes, produit le
 * camembert des **résiliations confirmées** par raison et le **taux de rattrapage**
 * (rattrapées / tentatives) global et par catégorie. Une raison inconnue retombe sur
 * `other`. Déterministe.
 */
export function computeTerminationStats(rows: readonly TerminationRow[]): TerminationStatsView {
  const confirmed = new Map<TerminationReason, number>();
  const attempts = new Map<TerminationReason, number>();
  const recovered = new Map<TerminationReason, number>();
  for (const row of rows) {
    const reason = normalizeReason(row.reason);
    bump(attempts, reason);
    if (row.outcome === "recovered") {
      bump(recovered, reason);
    } else {
      bump(confirmed, reason);
    }
  }
  const reasons = REASONS.map((r) => ({
    reason: r.reason,
    label: r.label,
    count: confirmed.get(r.reason) ?? 0,
  })).filter((r) => r.count > 0);
  const recoveryByReason = REASONS.map((r) =>
    recovery(r.reason, r.label, attempts.get(r.reason) ?? 0, recovered.get(r.reason) ?? 0),
  ).filter((r) => r.attempts > 0);
  const totalAttempts = sum(attempts);
  const totalRecovered = sum(recovered);
  return {
    reasons,
    recovery: recovery("all", "Global", totalAttempts, totalRecovered),
    recoveryByReason,
  };
}

function recovery(
  reason: TerminationReason | "all",
  label: string,
  attempts: number,
  recovered: number,
): TerminationRecovery {
  return { reason, label, attempts, recovered, rate: attempts > 0 ? recovered / attempts : 0 };
}

function normalizeReason(raw: string): TerminationReason {
  return LABEL.has(raw as TerminationReason) ? (raw as TerminationReason) : "other";
}

function bump(map: Map<TerminationReason, number>, reason: TerminationReason): void {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

function sum(map: Map<TerminationReason, number>): number {
  let total = 0;
  for (const value of map.values()) {
    total += value;
  }
  return total;
}
