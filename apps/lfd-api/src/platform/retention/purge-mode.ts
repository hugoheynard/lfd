/**
 * **Le cran de sûreté d'une purge** — exigé par Hugo le 2026-11-06 : « je ne
 * veux pas perdre de la data sans le savoir ».
 *
 * - `off` — le passage ne fait rien, pas même compter ;
 * - `dry-run` — **le défaut** : il compte et journalise ce qu'il AURAIT
 *   supprimé, sans toucher une ligne ;
 * - `on` — il supprime, sur décision explicite de Hugo seulement.
 */
export const PURGE_MODES = ["off", "dry-run", "on"] as const;

export type PurgeMode = (typeof PURGE_MODES)[number];

export const DEFAULT_PURGE_MODE: PurgeMode = "dry-run";

export function isPurgeMode(value: string): value is PurgeMode {
  return (PURGE_MODES as readonly string[]).includes(value);
}

/**
 * Le compte rendu d'un passage. `eligible` est ce que la règle désigne au
 * moment du passage (`null` en `off`, où rien n'est lu) ; `purged` ce qui a
 * réellement été supprimé (toujours 0 hors de `on`) ; `oldest` l'instant le
 * plus ancien parmi les éligibles, pour savoir de quand date ce qu'on perdrait.
 */
export interface PurgeReport {
  readonly mode: PurgeMode;
  readonly eligible: number | null;
  readonly purged: number;
  readonly oldest: Date | null;
}

/** Ce que la règle désigne, sans rien supprimer. */
export interface PurgeCensus {
  readonly count: number;
  readonly oldest: Date | null;
}

/** Ce qu'un passage demande à son adaptateur. */
export interface PurgeTarget {
  census(cutoff: Date): Promise<PurgeCensus>;
  pruneBatch(cutoff: Date, limit: number): Promise<number>;
}

/**
 * Le passage, commun aux purges : rien en `off`, le recensement en `dry-run`,
 * le recensement puis les lots bornés jusqu'au lot incomplet en `on`.
 * Idempotent : un passage rejoué ne trouve plus rien.
 */
export async function runPurge(
  mode: PurgeMode,
  target: PurgeTarget,
  cutoff: Date,
  batchSize: number,
): Promise<PurgeReport> {
  if (mode === "off") {
    return { mode, eligible: null, purged: 0, oldest: null };
  }
  const census = await target.census(cutoff);
  if (mode === "dry-run") {
    return { mode, eligible: census.count, purged: 0, oldest: census.oldest };
  }
  let purged = 0;
  for (;;) {
    const batch = await target.pruneBatch(cutoff, batchSize);
    purged += batch;
    if (batch < batchSize) {
      return { mode, eligible: census.count, purged, oldest: census.oldest };
    }
  }
}

/** La ligne de journal d'un passage : des comptes et une date, jamais une donnée. */
export function describePurge(subject: string, report: PurgeReport): string {
  const oldest = report.oldest === null ? "aucune" : report.oldest.toISOString();
  switch (report.mode) {
    case "off":
      return `${subject} : purge coupée (off), rien lu`;
    case "dry-run":
      return `${subject} : à blanc — ${String(report.eligible)} ligne(s) seraient supprimées, la plus ancienne du ${oldest} ; rien n'est supprimé`;
    case "on":
      return `${subject} : ${String(report.purged)} ligne(s) supprimée(s) sur ${String(report.eligible)} éligible(s), la plus ancienne du ${oldest}`;
  }
}
