/**
 * E2E de la constitution automatique — **le passage** (PA3) : quand il prépare, sous
 * quel auteur, et quand il ne fait rien.
 *
 * Découpé de `collection-autopilot.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-autopilot-scene.ts`.
 */
import {
  AUTOPILOT,
  BASE,
  clock,
  closesAt,
  ctx,
  cycle,
  ENTITIES,
  entity,
  fiche,
  HOUR_MS,
  pass,
  payerWithOrder,
  sentMails,
  staff,
  useCollectionAutopilotScene,
} from "./collection-autopilot-scene.js";

useCollectionAutopilotScene();

describe("la constitution automatique (PA3)", () => {
  it("prépare le lot sous l'auteur `system`, envoie les avis et range sa tentative", async () => {
    const id = await entity();
    await payerWithOrder(id);

    const report = await pass();

    expect(report.runs).toEqual([
      { legalEntityId: id, cycleClosesAt: closesAt.toISOString(), outcome: "constituted" },
    ]);
    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
      where: { legalEntityId: id },
    });
    expect(batch).toMatchObject({ constitutedBy: "system", constitutedByStaffId: null });
    const notice = await ctx.prisma.collectionNotice.findFirstOrThrow({
      where: { batchId: batch.id },
    });
    expect(notice.status).toBe("sent");
    expect(sentMails).toEqual(["patron@port.test"]);
    expect((await cycle(id)).batches[0]?.constitutedBy).toBe("system");
    const constituted = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.batch_constituted", subjectId: batch.id },
    });
    expect(constituted).toMatchObject({ actorType: "system", actorId: "collection-autopilot" });
    const ran = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.autopilot_ran", subjectId: id },
    });
    expect(ran.payload).toMatchObject({ outcome: "constituted", batchCount: 1, message: null });
    expect((await fiche(id)).lastAutopilotRun).toMatchObject({
      cycleClosesAt: closesAt.toISOString(),
      outcome: "constituted",
      message: null,
    });
  });

  it("un second passage du même cycle ne fait rien", async () => {
    const id = await entity();
    await payerWithOrder(id);
    await pass();

    const second = await pass();

    expect(second.runs).toEqual([]);
    expect(await ctx.prisma.collectionBatch.count({ where: { legalEntityId: id } })).toBe(1);
    expect(await ctx.prisma.collectionAutopilotRun.count()).toBe(1);
  });

  it("annuler le lot ne relance pas l'automatisme : reconstituer reste un geste humain", async () => {
    const id = await entity();
    await payerWithOrder(id);
    await pass();
    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
      where: { legalEntityId: id },
    });
    await staff().post(`${BASE}/batches/${batch.id}/cancel`).expect(204);

    expect((await pass()).runs).toEqual([]);
    const live = await ctx.prisma.collectionBatch.count({
      where: { legalEntityId: id, status: { not: "cancelled" } },
    });
    expect(live).toBe(0);
  });

  it("le bouton prépare toujours sous une fiche staff", async () => {
    const id = await entity();
    await payerWithOrder(id);

    await staff().post(`${BASE}/batches`).send({ legalEntityId: id }).expect(201);

    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
      where: { legalEntityId: id },
    });
    expect(batch.constitutedBy).toBe("staff");
    expect(batch.constitutedByStaffId).not.toBeNull();
    expect((await cycle(id)).batches[0]?.constitutedBy).toBe("staff");
  });

  it("avant l'heure prévue, ou automatisme désactivé : rien, pas même une trace", async () => {
    const id = await entity();
    await payerWithOrder(id);
    clock.set(new Date(closesAt.getTime() + HOUR_MS / 2));
    expect((await pass()).runs).toEqual([]);

    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().put(`${ENTITIES}/${id}/auto-collection`).send({ enabled: false }).expect(204);
    expect((await pass()).runs).toEqual([]);

    expect(await ctx.prisma.collectionAutopilotRun.count()).toBe(0);
    expect(await ctx.prisma.collectionBatch.count()).toBe(0);
  });

  it("refuse sans jeton interne (401)", async () => {
    await ctx.http().post(AUTOPILOT).expect(401);
  });
});
