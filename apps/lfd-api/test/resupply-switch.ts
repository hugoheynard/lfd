import type { E2eContext } from "./e2e-harness.js";
import { E2E_STAFF_SUB } from "./e2e-harness.js";

/**
 * Allume le réassort par sa route, comme l'écran Réglages › Production le
 * fait : éteint par défaut, il refuserait toute écriture d'une suite du
 * réassort (409 `resupply.disabled`). À rappeler après chaque `ctx.reset()`,
 * qui vide la ligne.
 */
export async function switchResupplyOn(ctx: E2eContext): Promise<void> {
  await ctx.asSub(E2E_STAFF_SUB).put("/admin/resupply-switch").send({ enabled: true }).expect(204);
}
