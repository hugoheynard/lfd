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
 * 🔴 Le binaire de K1 n'écrit QUE `legacy` (`LEGACY_PACKING_OWNER`) : seul
 * celui de K2 écrira `packing`.
 */
export type PackingOwner = "legacy" | "packing";

/** Le propriétaire que la clôture écrit tant que K2 n'est pas déployé. */
export const LEGACY_PACKING_OWNER: PackingOwner = "legacy";
