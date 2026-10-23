/**
 * E2E du lot de prélèvement figé — **le dépôt** : ce qui le refuse (mandat
 * absent ou révoqué, fichier jamais téléchargé) et ce qu'il fait des commandes.
 *
 * Découpé de `collection-batches.e2e-spec.ts` le 2026-10-23 ; scène commune
 * dans `collection-batch-scene.ts`.
 */
import {
  BASE,
  client,
  collectingEntity,
  constitute,
  ctx,
  cycle,
  mandated,
  orderOf,
  staff,
  stateOf,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

describe("le lot figé", () => {
  it("une société sans mandat rend le lot NON déposable (Q2), et l'exclusion est reprise au lot suivant", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    const orphan = await client("Chalet Sans Mandat");
    const unpaid = await orderOf(orphan);

    const [batchId] = await constitute(entity);
    const view = await cycle(entity);
    expect(view.batches[0]).toMatchObject({
      depositable: false,
      unmandatedCompanies: ["Chalet Sans Mandat"],
    });
    expect(view.exclusions).toMatchObject([
      { orderNumber: unpaid.orderNumber, reason: "no_mandate" },
    ]);
    const file = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect(file.headers["content-disposition"]).toContain("BROUILLON");
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(409);

    await mandated(entity, orphan);
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/cancel`)
      .expect(204);
    await constitute(entity);

    expect(await stateOf(unpaid.id)).toBe("batched");
    expect((await cycle(entity)).exclusions).toEqual([]);
  });

  it("refuse le dépôt d'un lot dont un mandat a été révoqué depuis la constitution", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const mandateId = await mandated(entity, port);
    await orderOf(port);
    const [batchId] = await constitute(entity);

    await ctx.prisma.paymentMandate.update({
      where: { id: mandateId },
      data: { status: "revoked" },
    });
    await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    const refused = await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(409);

    expect(refused.text).toContain("Boulangerie du Port");
  });

  it("déposé : les commandes passent prélevées, et ne se règlent plus autrement", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    const placed = await orderOf(port);
    const [batchId] = await constitute(entity);

    await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(204);

    expect(await stateOf(placed.id)).toBe("collected");
    await staff()
      .post(`${BASE}/orders/${placed.id}/settle-otherwise`)
      .send({ note: "virement" })
      .expect(409);
  });

  /** « J'ai déposé » ne se dit pas d'un fichier que personne n'a téléchargé (2026-10-23). */
  it("refuse le dépôt d'un lot jamais téléchargé ; le téléchargement l'ouvre et s'inscrit", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    const [batchId] = await constitute(entity);

    const refused = await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(409);
    expect(refused.text).toContain("n'a jamais été téléchargé");
    expect((await cycle(entity)).batches[0]?.lastDownloadedAt).toBeNull();

    await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect((await cycle(entity)).batches[0]?.lastDownloadedAt).not.toBeNull();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: batchId ?? "", type: "collection.batch_downloaded" },
    });
    expect(facts).toHaveLength(1);
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(204);
  });

  /**
   * Verrou (décision 1 de Hugo, 2026-10-23) : une société suspendue reste
   * prélevée pour ses dettes. Le compte des clients l'écarte de l'AFFICHAGE
   * (`countedPayerIdsAt`) ; le lot, lui, ne lit pas le statut.
   */
  it("une société suspendue avec un mandat actif est prélevée pour ses factures dues", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    const placed = await orderOf(port);
    await ctx.prisma.company.update({ where: { id: port }, data: { status: "suspended" } });

    const [batchId] = await constitute(entity);
    await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(204);

    expect(await stateOf(placed.id)).toBe("collected");
  });
});
