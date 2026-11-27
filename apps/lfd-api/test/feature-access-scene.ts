/**
 * **Les gestes de l'écran des accès** pour les e2e d'une surface fermée par une
 * clé : ouvrir à tous, exempter une adresse. Par les vraies routes du staff,
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

/** Ajoute une adresse à la liste d'exemption d'une clé exemptible. */
export async function exemptFromFeature(
  ctx: E2eContext,
  key: FeatureKey,
  email: string,
): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/feature-access/${key}/exemptions`)
    .send({ email })
    .expect(201);
}
