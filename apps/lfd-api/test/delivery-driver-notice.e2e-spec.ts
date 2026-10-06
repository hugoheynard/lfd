/**
 * E2E de **« Mes données »** — le texte d'information du livreur et son accusé
 * de lecture (`documentation/legal/rgpd-livreur.md`, §7 point 2) : la lecture,
 * l'accusé daté par le serveur, le rejeu, la version périmée, le mur (on
 * n'accuse que pour soi) et le droit `delivery_driving`.
 */
import type { MyDriverNoticeView } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";

const NOTICE = "/admin/livraison/mes-donnees";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await seedDriverRole(ctx);
});

async function noticeOf(agent: ReturnType<E2eContext["asSub"]>): Promise<MyDriverNoticeView> {
  return jsonBody<MyDriverNoticeView>(await agent.get(NOTICE).expect(200));
}

describe("« Mes données » du livreur", () => {
  it("sans accusé, rend le texte et `acknowledgedAt` nul", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");

    const view = await noticeOf(paul.agent);

    expect(view.acknowledgedAt).toBeNull();
    expect(view.notice.version).toBeGreaterThan(0);
    expect(view.notice.sections.length).toBeGreaterThan(0);
  });

  it("« J'ai compris » écrit l'accusé de SA fiche, et pas celle d'un autre", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { notice } = await noticeOf(paul.agent);

    await paul.agent.post(`${NOTICE}/accuse`).send({ version: notice.version }).expect(204);

    expect((await noticeOf(paul.agent)).acknowledgedAt).not.toBeNull();
    expect((await noticeOf(lea.agent)).acknowledgedAt).toBeNull();
    const rows = await ctx.prisma.deliveryDriverNoticeAcknowledgement.findMany();
    expect(rows.map((row) => row.staffId)).toEqual([paul.id]);
  });

  it("rejoué, garde la première date", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { notice } = await noticeOf(paul.agent);

    await paul.agent.post(`${NOTICE}/accuse`).send({ version: notice.version }).expect(204);
    const first = (await noticeOf(paul.agent)).acknowledgedAt;
    await paul.agent.post(`${NOTICE}/accuse`).send({ version: notice.version }).expect(204);

    expect((await noticeOf(paul.agent)).acknowledgedAt).toBe(first);
    expect(await ctx.prisma.deliveryDriverNoticeAcknowledgement.count()).toBe(1);
  });

  it("refuse une version qui n'est pas la courante, en le disant", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { notice } = await noticeOf(paul.agent);

    const refused = await paul.agent
      .post(`${NOTICE}/accuse`)
      .send({ version: notice.version + 1 })
      .expect(409);

    expect(jsonBody<{ message: string }>(refused).message).toContain(
      "a changé pendant votre lecture",
    );
    expect(await ctx.prisma.deliveryDriverNoticeAcknowledgement.count()).toBe(0);
  });

  it("refuse une forme invalide (400), et sans le droit de conduire (403)", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const vendeur = await staffWithRole(ctx, "vendeur", "comptoir", "comptoir");

    await paul.agent.post(`${NOTICE}/accuse`).send({ version: "1" }).expect(400);
    await vendeur.agent.get(NOTICE).expect(403);
    await vendeur.agent.post(`${NOTICE}/accuse`).send({ version: 1 }).expect(403);
  });
});
