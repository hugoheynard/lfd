/**
 * URL de la base de **développement** locale — le conteneur `lfd-dev-postgres`
 * (port hôte 5433), base `lfc_b2b_dev`, DISTINCTE de `lfc_pim` (PIM) et de
 * `lfc_b2b_test` (jetable des tests). Schéma `postgresql://` ⇒ adapter `pg`
 * côté `PrismaService` — le même transport que la production une fois sortie
 * d'Accelerate : c'est l'HÔTE local, pas le schéma, qui dit que c'est le poste
 * (`local-target.ts`).
 *
 * Surchargeable par `DEV_DATABASE_LFD_URL` si le conteneur bouge.
 */
export const DEV_DATABASE_URL =
  process.env["DEV_DATABASE_LFD_URL"] ?? "postgresql://lfc:lfc@localhost:5433/lfc_b2b_dev";
