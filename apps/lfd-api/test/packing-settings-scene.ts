import { admin } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";

/** La route de Réglages › Colisage. */
export const PACKING_SETTINGS = "/admin/packing/settings";

/**
 * Ouvre le partage d'une moitié de bac — fermé par défaut depuis le
 * 2026-10-25 (Hugo). À rappeler après chaque `ctx.reset()`, qui vide la ligne.
 */
export async function openHalfSharing(ctx: E2eContext): Promise<void> {
  await admin(ctx).put(PACKING_SETTINGS).send({ halfSharing: true }).expect(204);
}
