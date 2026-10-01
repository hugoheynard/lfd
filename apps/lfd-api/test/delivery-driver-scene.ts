/**
 * Les fixtures partagées par les suites e2e du **livreur** (plan « Ma
 * tournée », MT1 à MT3) : le rôle et son mur de droits
 * (`delivery-driver-role.e2e-spec.ts`), l'affectation et la page
 * (`delivery-my-round.e2e-spec.ts`).
 *
 * 🔴 Le rôle `livreur` NAÎT À L'ÉCRAN (2026-10-01,
 * `documentation/livraisons/plan-droits-par-geste.md`, DG-D6) : la migration
 * qui le posait (`20261001120100_le_role_livreur`) a été retirée avant toute
 * mise en ligne — une migration ajoute une ressource, jamais un droit à un
 * rôle. On le crée donc ici par le geste même d'Hugo : `POST
 * /admin/staff-roles`, en administrateur, par le vrai handler.
 */
import type request from "supertest";

import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

export const MY_ROUND = "/admin/livraison/ma-tournee";

/** Le rôle tel qu'Hugo le crée à l'écran : le droit de conduire, et lui seul. */
export const DRIVER_ROLE = {
  key: "livreur",
  label: "Livreur",
  grants: [{ resource: "delivery_driving", action: "write" }],
} as const;

/** Crée le rôle `livreur` à l'écran — `ctx.reset()` ne sème que les rôles de la graine. */
export async function seedDriverRole(ctx: E2eContext): Promise<void> {
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DRIVER_ROLE).expect(201);
}

/** Une fiche active au rôle `roleKey` (défaut : `livreur`), liée au `sub` ; rend son id et son agent. */
export async function staffWithRole(
  ctx: E2eContext,
  sub: string,
  roleKey: string = "livreur",
  role: "admin" | "comptoir" | null = null,
): Promise<{ readonly id: string; readonly agent: request.Agent }> {
  const created = await ctx.prisma.staffUser.create({
    data: {
      firstName: sub,
      lastName: "Test",
      email: `${sub}@lfc.test`,
      roleKey,
      role,
      status: "active",
      auth0Id: sub,
    },
    select: { id: true },
  });
  return { id: created.id, agent: ctx.asSub(sub) };
}
