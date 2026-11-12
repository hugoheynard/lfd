/**
 * E2E : **pas de changement de moyen pendant un retour bancaire** (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, V10).
 * Un payeur prélevé dont la ligne revient de la banque, retour pas encore
 * décidé : passer au virement est refusé, en nommant le geste de sortie.
 */
import { jsonBody } from "./e2e-harness.js";
import {
  closesAt,
  ctx,
  depositedLine,
  invoicedPayer,
  setUpEntity,
  signal,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";

useCollectionReturnScene();

describe("le moyen d'encaissement pendant un retour bancaire (V10)", () => {
  it("refuse le changement tant que le retour est en cours", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    const { batchId } = await depositedLine(entityId);
    await signal(batchId);

    const refused = await staff()
      .put(`/admin/accounting/legal-entities/${entityId}/payers/${payer}/collection-means`)
      .send({ means: "bank_transfer", reason: "Le client préfère le virement" })
      .expect(409);

    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: "accounting.collection_means.return_pending",
      message: expect.stringContaining("Retours bancaires") as unknown,
    });
    expect(await ctx.prisma.payerCollectionMeans.count()).toBe(0);
  });
});
