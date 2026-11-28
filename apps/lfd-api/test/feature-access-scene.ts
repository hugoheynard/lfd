/**
 * **Les gestes de l'écran des accès** pour les e2e d'une surface fermée par une
 * clé : ouvrir à tous, exempter une société. Par les vraies routes du staff,
 * pour que la résolution lue soit celle de la production. Demande l'admin
 * doublé à l'amorçage (`ADMIN_VERIFIER_OVERRIDE`).
 */
import type { FeatureKey } from "@lfd/contracts";

import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Pose la dérogation « ouvert » d'une clé à niveaux de porte (`closed`/`open`). */
export async function openFeature(ctx: E2eContext, key: FeatureKey): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/feature-access/${key}`)
    .send({ value: "open" })
    .expect(204);
}

/** Ajoute une société à la liste d'exemption d'une clé qui s'exempte par société. */
export async function exemptCompanyFromFeature(
  ctx: E2eContext,
  key: FeatureKey,
  companyId: string,
): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/feature-access/${key}/company-exemptions`)
    .send({ companyId })
    .expect(204);
}
