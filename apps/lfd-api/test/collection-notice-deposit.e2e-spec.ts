/**
 * E2E de l'avis de prélèvement — **le dépôt** : « Marquer déposé » exige les avis envoyés.
 *
 * Découpé de `collection-notices.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-notice-scene.ts`.
 */
import {
  BASE,
  billingContact,
  collectingEntity,
  constitute,
  cycle,
  orderOf,
  payer,
  refuseMailsWith,
  sentMails,
  staff,
  useCollectionNoticeScene,
} from "./collection-notice-scene.js";

useCollectionNoticeScene();

describe("« Marquer déposé » exige les avis envoyés", () => {
  it("ni contact ni détenteur : avis non envoyable, dépôt refusé en nommant le payeur", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await orderOf(port.id);

    const batchId = await constitute(entity);

    expect(sentMails).toHaveLength(0);
    const [batch] = (await cycle(entity)).batches;
    expect(batch?.lines[0]?.notice).toMatchObject({ status: "unsendable", recipientEmail: null });
    await staff().get(`${BASE}/batches/${batchId}/file.xml`).expect(200);
    const refused = await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(409);
    expect(refused.text).toContain("Boulangerie du Port (aucune adresse");
  });

  it("envoi refusé par le fournisseur : avis en échec, dépôt refusé", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    refuseMailsWith(new Error("adresse en liste de suppression"));

    const batchId = await constitute(entity);

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.lines[0]?.notice).toMatchObject({
      status: "failed",
      failure: "adresse en liste de suppression",
    });
    await staff().get(`${BASE}/batches/${batchId}/file.xml`).expect(200);
    const refused = await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(409);
    expect(refused.text).toContain("Boulangerie du Port (envoi de l");
  });

  it("avis envoyé : le dépôt passe", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);

    const batchId = await constitute(entity);

    await staff().get(`${BASE}/batches/${batchId}/file.xml`).expect(200);
    await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(204);
  });
});
