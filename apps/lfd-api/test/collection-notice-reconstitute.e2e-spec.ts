/**
 * E2E de l'avis de prélèvement — **l'annulation et la reconstitution** : un avis
 * parti se corrige.
 *
 * Découpé de `collection-notices.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-notice-scene.ts`.
 */
import type { ConstitutedBatchesView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import {
  BASE,
  billingContact,
  collectingEntity,
  constitute,
  ctx,
  cycle,
  orderOf,
  payer,
  sentMails,
  staff,
  useCollectionNoticeScene,
} from "./collection-notice-scene.js";

useCollectionNoticeScene();

describe("annuler puis reconstituer : un avis parti se corrige", () => {
  it("montant changé : un rectificatif part, qui dit l'ancien montant ; le nouveau lot se dépose", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    const first = await constitute(entity);
    await staff().post(`${BASE}/batches/${first}/cancel`).expect(204);
    await orderOf(port.id);

    const second = await constitute(entity);

    expect(sentMails).toHaveLength(2);
    expect(sentMails[0]).toMatchObject({ data: { kind: "notice", previous: null } });
    expect(sentMails[1]).toMatchObject({ data: { kind: "correction" } });
    expect(sentMails[1]).not.toMatchObject({ data: { previous: null } });
    const correction = await ctx.prisma.collectionNotice.findFirstOrThrow({
      where: { batchId: second },
    });
    expect(correction).toMatchObject({ kind: "correction", status: "sent", amountCents: 21_100 });
    expect(correction.previousAmountCents).toBe(10_550);
    await staff().get(`${BASE}/batches/${second}/file.xml`).expect(200);
    await staff().post(`${BASE}/batches/${second}/deposit`).expect(204);
  });

  it("identique : rien ne repart, et le nouveau lot se dépose", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    const first = await constitute(entity);
    await staff().post(`${BASE}/batches/${first}/cancel`).expect(204);

    const second = await constitute(entity);

    expect(sentMails).toHaveLength(1);
    const [batch] = (await cycle(entity)).batches;
    expect(batch?.lines[0]?.notice).toMatchObject({ kind: "unchanged", status: "sent" });
    await staff().get(`${BASE}/batches/${second}/file.xml`).expect(200);
    await staff().post(`${BASE}/batches/${second}/deposit`).expect(204);
  });

  /**
   * PA2, § 7 comblé le 2026-10-09 : une préparation qui ne constituait aucun
   * lot n'envoyait pas l'annulation, qui attendait une préparation qui prélève.
   */
  it("plus aucun lot (tout écarté) : l'annulation part quand même, hors lot", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    const first = await constitute(entity);
    await staff().post(`${BASE}/batches/${first}/cancel`).expect(204);
    await ctx.prisma.paymentMandate.updateMany({
      where: { companyId: port.id },
      data: { status: "revoked" },
    });

    const response = await staff()
      .post(`${BASE}/batches`)
      .send({ legalEntityId: entity })
      .expect(201);
    await ctx.drain();

    expect(jsonBody<ConstitutedBatchesView>(response).batchIds).toEqual([]);
    expect(sentMails).toHaveLength(2);
    expect(sentMails[1]).toMatchObject({ to: "compta@port.test", data: { kind: "cancellation" } });
    const cancellation = await ctx.prisma.collectionNotice.findFirstOrThrow({
      where: { kind: "cancellation" },
    });
    expect(cancellation).toMatchObject({
      batchId: null,
      debtorCompanyId: port.id,
      status: "sent",
      amountCents: 10_550,
    });
  });
});
