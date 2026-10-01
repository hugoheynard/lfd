/**
 * Les fixtures partagées par les suites e2e du **livreur** (plan « Ma
 * tournée », MT1 à MT3) : le rôle et son mur de droits
 * (`delivery-driver-role.e2e-spec.ts`), l'affectation et la page
 * (`delivery-my-round.e2e-spec.ts`).
 *
 * Le rôle `livreur` n'a pas de valeur `StaffRole` : le harnais ne le sème pas
 * (`legacyRoleSeeds`). On le sème ici par **l'ordre même de la migration** qui
 * le pose en production, relu dans son fichier — un double recopié dériverait
 * au premier droit changé, et l'e2e passerait sur un rôle que la production ne
 * connaît pas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type request from "supertest";

import type { E2eContext } from "./e2e-harness.js";

export const MY_ROUND = "/admin/livraison/ma-tournee";

/** La migration qui pose le rôle `livreur` et le droit de conduire de l'admin. */
const DRIVER_ROLE_MIGRATION = "20261001120100_le_role_livreur";

/** Les ordres de la migration sur `staff_role_definitions` — le format que relit la parité. */
function driverRoleStatements(): readonly string[] {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations", DRIVER_ROLE_MIGRATION, "migration.sql"),
    "utf8",
  );
  return sql.match(/^(?:INSERT INTO|UPDATE) "public"\."staff_role_definitions"[^;]*;/gmu) ?? [];
}

/** Rejoue la migration du rôle : `ctx.reset()` ne re-sème que les rôles du contrat. */
export async function seedDriverRole(ctx: E2eContext): Promise<void> {
  const statements = driverRoleStatements();
  if (statements.length !== 2) {
    throw new TypeError(
      `${DRIVER_ROLE_MIGRATION} : deux ordres attendus, ${String(statements.length)} lus`,
    );
  }
  for (const statement of statements) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
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
