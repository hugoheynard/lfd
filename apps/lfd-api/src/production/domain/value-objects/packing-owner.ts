/**
 * **Qui colise une journée** — le poste du fournil (`legacy`) ou le bloc du
 * colisage (`packing`). Référence : `documentation/colisage/colisage.md`.
 *
 * Écrit à la clôture, jamais après : une journée garde le propriétaire qu'elle
 * a eu en s'arrêtant.
 *
 * Depuis K2 (2026-10-04), la clôture écrit TOUJOURS `packing`. L'ancien poste
 * est retiré depuis K3c (2026-10-05) : `legacy` ne nomme plus que l'histoire
 * des journées arrêtées avant K2, qu'aucun écran ne colise plus.
 */
export type PackingOwner = "legacy" | "packing";

/** L'ancien poste — celui d'une journée jamais arrêtée, ou arrêtée avant K2. */
export const LEGACY_PACKING_OWNER: PackingOwner = "legacy";

/** Le colisage, son propre bloc (K2). */
export const PACKING_PACKING_OWNER: PackingOwner = "packing";
