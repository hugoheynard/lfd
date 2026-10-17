import type { PrepareCommerceOperationPayload } from "@lfd/contracts";

import { ReferentialOperationWriting } from "../src/pim/operations/domain/ports/referential-operation-writing.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

/**
 * La scène des opérations écrites AU COMMERCE (lot 1 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 */

/**
 * L'écriture des opérations AU RÉFÉRENTIEL, rouverte le temps d'un geste —
 * fermée pour de bon en production depuis le 2026-10-17 (X1 de
 * `plan-sans-interrupteurs.md`). Seules les suites qui préparent au
 * référentiel ce que la migration reprendra, ou qui éprouvent l'opération du
 * référentiel elle-même, la doublent ; elles partent avec `pim/operations/**`
 * (X4).
 */
export class SwitchableReferentialWriting extends ReferentialOperationWriting {
  private open = false;

  isOpen(): boolean {
    return this.open;
  }

  /** Le temps d'un geste au référentiel, comme avant la bascule. */
  async openFor<T>(gesture: () => Promise<T>): Promise<T> {
    this.open = true;
    try {
      return await gesture();
    } finally {
      this.open = false;
    }
  }
}

/** Le référentiel ouvert pendant toute la suite : l'opération du PIM est son sujet. */
export const OPEN_REFERENTIAL_WRITING = { isOpen: (): boolean => true };

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
