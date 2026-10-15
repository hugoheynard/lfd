import type { PrepareCommerceOperationPayload } from "@lfd/contracts";

import { AppConfig } from "../src/platform/config/app-config.js";
import { daysAgo, serviceDay, type E2eContext } from "./e2e-harness.js";

/**
 * La scène des opérations écrites AU COMMERCE (lot 1 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 */

/** La configuration réelle, écriture OUVERTE — fermée par défaut, et en e2e (`setup-env.ts`). */
export class OpenOperationsAtCommerceConfig extends AppConfig {
  override operationsAtCommerce(): boolean {
    return true;
  }
}

export const OPERATIONS = "/admin/operations";

/** Le jeton porteur EST le `sub` : plusieurs personnes dans une même suite. */
export const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/**
 * Noël, RELATIF à maintenant : annoncé dans un mois, clos dans onze semaines,
 * retiré la semaine d'après — rien n'y devient faux avec le calendrier.
 */
export function noelBody(
  over: Partial<PrepareCommerceOperationPayload> = {},
): PrepareCommerceOperationPayload {
  return {
    key: "noel-2026",
    name: { fr: "Noël", en: "Christmas" },
    lede: null,
    image: null,
    announceFrom: daysAgo(-30),
    orderFrom: null,
    orderUntil: daysAgo(-77),
    pickupFrom: serviceDay(78),
    pickupUntil: serviceDay(84),
    audience: "both",
    ...over,
  };
}

/** Une personne au rôle neuf, qui ne tient que ces droits — créé à l'écran des rôles. */
export async function staffWith(
  ctx: E2eContext,
  key: string,
  grants: readonly { readonly resource: string; readonly action: "read" | "write" }[],
): Promise<string> {
  await ctx
    .asSub("staff-e2e")
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}
