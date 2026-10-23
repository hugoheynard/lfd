/**
 * E2E du lot de prélèvement figé — **l'annulation** : un lot vivant se défait
 * et se reconstitue sous un autre `MsgId` ; un lot déposé ne s'annule pas.
 *
 * Découpé de `collection-batches.e2e-spec.ts` le 2026-10-23 ; scène commune
 * dans `collection-batch-scene.ts`.
 */
import {
  BASE,
  client,
  collectingEntity,
  constitute,
  mandated,
  messageIdOf,
  orderOf,
  staff,
  stateOf,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

describe("le lot figé", () => {
  it("annuler puis reconstituer change le MsgId, et la commande revient", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    const placed = await orderOf(port);

    const [first] = await constitute(entity);
    const before = await staff()
      .get(`${BASE}/batches/${first ?? ""}/file.xml`)
      .expect(200);
    await staff()
      .post(`${BASE}/batches/${first ?? ""}/cancel`)
      .expect(204);
    expect(await stateOf(placed.id)).toBe("due");
    const [second] = await constitute(entity);
    const after = await staff()
      .get(`${BASE}/batches/${second ?? ""}/file.xml`)
      .expect(200);

    expect(messageIdOf(after.text)).not.toBe(messageIdOf(before.text));
    expect(await stateOf(placed.id)).toBe("batched");
  });

  it("refuse d'annuler un lot déposé, en nommant le double prélèvement", async () => {
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

    const refused = await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/cancel`)
      .expect(409);

    expect(refused.text).toContain("ferait prélever deux fois");
    expect(await stateOf(placed.id)).toBe("collected");
  });
});
