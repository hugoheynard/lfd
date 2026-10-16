import type { PrepareCommerceOperationPayload } from "@lfd/contracts";

import { AppConfig } from "../src/platform/config/app-config.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

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

/**
 * L'interrupteur, basculable PENDANT la suite (lot 3) : ouvert au démarrage —
 * les porteurs de la médiathèque se composent une fois —, puis refermé le
 * temps de préparer au référentiel ce que la migration reprendra. Les routes
 * du référentiel et l'ingestion relisent l'interrupteur à chaque appel.
 */
export class SwitchableOperationsConfig extends AppConfig {
  atCommerce = true;

  override operationsAtCommerce(): boolean {
    return this.atCommerce;
  }

  /** Le temps d'un geste au référentiel, comme avant la bascule. */
  async closedFor<T>(gesture: () => Promise<T>): Promise<T> {
    this.atCommerce = false;
    try {
      return await gesture();
    } finally {
      this.atCommerce = true;
    }
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

/**
 * Dépose à la médiathèque un PNG minimal — la largeur fait l'image (l'URL est
 * le hachage) — et pose son point focal s'il y en a un. Rend son URL.
 */
export async function depositImage(
  ctx: E2eContext,
  width: number,
  focal: { readonly x: number; readonly y: number } | null,
): Promise<string> {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(600, 20);
  const deposited = await ctx.asSub(E2E_STAFF_SUB).post("/media").attach("file", png, "image.png");
  expect(deposited.status).toBe(201);
  const { url } = jsonBody<{ url: string }>(deposited);
  if (focal !== null) {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put("/media")
      .send({ url, name: `image-${width}`, tags: [], focal })
      .expect(200);
  }
  return url;
}
