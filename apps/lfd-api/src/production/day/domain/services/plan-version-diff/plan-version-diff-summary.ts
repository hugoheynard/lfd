import type {
  PlanVersionDiff,
  ProductionEffect,
  ResupplyChange,
  ShipmentChange,
  UnexplainedExit,
} from "./plan-version-diff.types.js";

/** Combien de changements de commandes l'e-mail énumère avant « et N autres ». */
export const SUMMARY_CHANGE_LIMIT = 10;

/**
 * Le résumé que porte l'e-mail « dossier mis à jour » (lot H6) : la
 * production entière, les changements plafonnés, puis les sorties à vérifier
 * entières — celles-là ne se cachent pas derrière un compte.
 */
export interface PlanVersionDiffSummary {
  readonly production: readonly ProductionEffect[];
  readonly changes: readonly ShipmentChange[];
  /** Les changements tus : « et N autres ». */
  readonly otherChanges: number;
  readonly resupplies: readonly ResupplyChange[];
  readonly toCheck: readonly UnexplainedExit[];
}

/**
 * **Résumer une comparaison pour l'e-mail** — une structure ; la mise en
 * mots est au dictionnaire des e-mails. Calculé sur le même
 * `diffPlanVersions` que l'écran : les deux ne peuvent pas dire deux choses
 * différentes.
 */
export function summarizePlanVersionDiff(
  diff: PlanVersionDiff,
  limit: number = SUMMARY_CHANGE_LIMIT,
): PlanVersionDiffSummary {
  const shown = diff.changes.slice(0, Math.max(0, limit));
  return {
    production: diff.production,
    changes: shown,
    otherChanges: diff.changes.length - shown.length,
    resupplies: diff.resupplies,
    toCheck: diff.toCheck,
  };
}

/** Rien n'a changé entre les deux versions. */
export function isEmptyPlanVersionDiff(diff: PlanVersionDiff): boolean {
  return (
    diff.production.length === 0 &&
    diff.changes.length === 0 &&
    diff.resupplies.length === 0 &&
    diff.toCheck.length === 0
  );
}
