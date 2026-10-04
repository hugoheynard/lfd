/**
 * **Qui colise une journée** — le poste du fournil (`legacy`) ou le bloc du
 * colisage (`packing`). Plan `documentation/colisage/plan-domaine-colisage.md`,
 * §13, B1.
 *
 * Écrit à la clôture, jamais après : une journée garde le propriétaire qu'elle
 * a eu en s'arrêtant, ce qui règle aussi la journée arrêtée pendant un
 * déploiement. Les routes, la supervision et le poste liront cette valeur,
 * jamais une table de l'ombre.
 *
 * Depuis K2 (2026-10-04), la clôture écrit TOUJOURS `packing` — « on bascule
 * direct » (Hugo). `legacy` ne se lit plus que sur les journées arrêtées
 * avant, qui finissent sur l'ancien poste.
 */
export type PackingOwner = "legacy" | "packing";

/** L'ancien poste — celui d'une journée jamais arrêtée, ou arrêtée avant K2. */
export const LEGACY_PACKING_OWNER: PackingOwner = "legacy";

/** Le colisage, son propre bloc (K2). */
export const PACKING_PACKING_OWNER: PackingOwner = "packing";
