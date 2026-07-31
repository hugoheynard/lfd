/**
 * URL de la base de **développement** locale — le conteneur `lfd-dev-postgres`
 * (port hôte 5433), base `lfc_b2b_dev`, DISTINCTE de `lfc_pim` (PIM) et de
 * `lfc_b2b_test` (jetable des tests). Schéma `postgresql://` ⇒ adapter `pg`
 * direct côté `PrismaService` (jamais Accelerate).
 *
 * Surchargeable par `DEV_DATABASE_B2B_URL` si le conteneur bouge.
 */
export const DEV_DATABASE_URL =
  process.env["DEV_DATABASE_B2B_URL"] ?? "postgresql://lfc:lfc@localhost:5433/lfc_b2b_dev";
