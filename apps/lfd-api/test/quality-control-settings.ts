import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/**
 * Ouvre le contrôle qualité AUX DEUX niveaux par la vraie route de Réglages ›
 * Commandes (décision de Hugo, 2026-10-26). Le contrôle au fournil est
 * désactivé par défaut : une suite qui éprouve un verdict de LIGNE l'ouvre
 * d'abord, comme le ferait le personnel.
 */
export async function openQualityControl(ctx: E2eContext): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/production/quality-settings")
    .send({ lineChecks: true, orderChecks: true })
    .expect(204);
}
