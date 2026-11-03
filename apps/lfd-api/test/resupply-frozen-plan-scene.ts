/**
 * La scène du réassort au plan figé (R3a), partagée par
 * `resupply-frozen-plan` et `resupply-frozen-plan-race` : la veille de la
 * journée servie, deux heures (générale 18:00, réassort 20:00), un point et
 * un article du catalogue semé.
 */
import type { ResupplyArticleView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { CROISSANT, SERVICE_DAY, STAFF } from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import { counterSent } from "./site-resupply-scene.js";

export const EVE = addDays(SERVICE_DAY, -1);

/** L'instant de la maison `time`, la veille de la journée servie. */
export function eveAt(time: string): Date {
  const instant = localToInstant(EVE, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${EVE} ${time}`);
  }
  return instant;
}

/** Générale la veille à 18:00 sans rattrapage, réassort la veille à 20:00. */
export async function twoHours(ctx: E2eContext): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put("/admin/order-cutoffs/general")
    .send({ daysBefore: 1, time: "18:00", graceMinutes: 0 })
    .expect(204);
  await ctx
    .asSub(STAFF)
    .patch("/admin/order-cutoff-settings")
    .send({ resupplyCutoffTime: "20:00" })
    .expect(204);
}

/** Un tour de l'arrêt automatique ; rend son issue. */
export async function tour(ctx: E2eContext): Promise<string> {
  const response = await ctx
    .http()
    .post("/admin/production/auto-close")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<{ outcome: string }>(response).outcome;
}

/** Le point de la suite : celui qui existe, sinon le Village. */
export async function siteId(ctx: E2eContext): Promise<string> {
  const existing = await ctx.prisma.site.findFirst({ select: { id: true } });
  if (existing !== null) {
    return existing.id;
  }
  const site = await ctx.prisma.site.create({
    data: {
      label: "Village",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
    select: { id: true },
  });
  return site.id;
}

/** Le croissant s'il est proposé, sinon le premier article. */
export async function article(ctx: E2eContext): Promise<string> {
  const articles = jsonBody<readonly ResupplyArticleView[]>(
    await ctx.asSub(STAFF).get("/admin/resupply-receipts/articles").expect(200),
  );
  const found = articles.find((candidate) => candidate.sku === CROISSANT) ?? articles[0];
  expect(found).toBeDefined();
  return found?.sku ?? "";
}

/** Le comptoir envoie un « pour demain » de `quantity` pièces. */
export async function sendTomorrow(
  ctx: E2eContext,
  quantity: number,
): Promise<{ site: string; id: string }> {
  const site = await siteId(ctx);
  const id = await counterSent(ctx.asSub(STAFF), site, "tomorrow", [
    { sku: await article(ctx), quantity },
  ]);
  return { site, id };
}

/** La copie figée des réassorts de la journée servie. */
export function frozen(ctx: E2eContext) {
  return ctx.prisma.productionResupply.findMany({
    where: { serviceDay: SERVICE_DAY },
    select: { resupplyId: true, lines: { select: { sku: true, quantity: true } } },
  });
}

/** « Annuler » au comptoir. */
export function cancel(ctx: E2eContext, site: string, id: string): request.Test {
  return ctx.asSub(STAFF).post(`/admin/site-resupplies/sites/${site}/${id}/cancel`);
}
