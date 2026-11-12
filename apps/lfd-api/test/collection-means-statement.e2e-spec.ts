/**
 * E2E du **moyen d'encaissement des bons sans facture** (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, K9,
 * V10) : le chemin des arrêtés — l'aperçu qui simule, la constitution sans
 * plancher de facture — lit le moyen de la période où le bon a été soldé.
 * Au virement, pas d'arrêté : le bon n'est ni prélevé, ni écarté, ni compté
 * « sans mandat ».
 *
 * ⚠️ Le segment « au virement depuis deux mois » est écrit par Prisma (la
 * route le daterait de la prochaine clôture d'un payeur qui a commandé) :
 * même dette que les mandats de la scène. Aucune date absolue : tout se
 * compte depuis la clôture que la scène calcule.
 */
import type { CollectionPreviewView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import {
  BASE,
  client,
  closesAt,
  collectingEntity,
  constitute,
  ctx,
  DAY_MS,
  mandated,
  orderOf,
  staff,
  stateOf,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

/** Le payeur règle par virement depuis deux mois : toute période récente est au virement. */
async function atTransfer(entityId: string, companyId: string): Promise<void> {
  const since = new Date(closesAt.getTime() - 60 * DAY_MS);
  await ctx.prisma.payerCollectionMeans.create({
    data: {
      id: `means_${companyId}`,
      legalEntityId: entityId,
      payerCompanyId: companyId,
      effectiveFrom: since,
      means: "bank_transfer",
      reason: "Le client règle par virement",
      createdAt: since,
      createdByStaffId: "staff-e2e",
    },
  });
}

describe("les bons sans facture d'une période au virement (K9)", () => {
  it("le prélèvement d'essai (l'aperçu) les écarte sans les compter « sans mandat »", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    await mandated(entity, port);
    await mandated(entity, quai);
    await atTransfer(entity, quai);
    await orderOf(port);
    await orderOf(quai);

    const view = jsonBody<CollectionPreviewView>(
      await staff().get(`${BASE}/preview?legalEntityId=${entity}`).expect(200),
    );

    if (view.state !== "open") {
      throw new Error(`aperçu attendu ouvert, reçu ${view.state}`);
    }
    expect(view.lines.map((line) => line.payerCompanyId)).toEqual([port]);
    expect(view.exclusions).toEqual([]);
    expect(view.unmandatedCompanies).toEqual([]);
  });

  it("la constitution ne fait pas d'arrêté au virement ; le bon au prélèvement est prélevé", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    await mandated(entity, port);
    await atTransfer(entity, quai);
    const debited = await orderOf(port);
    const transferred = await orderOf(quai);

    const [batchId] = await constitute(entity);

    const lines = await ctx.prisma.collectionBatchLine.findMany({
      where: { batchId: batchId ?? "" },
    });
    expect(lines.map((line) => line.debtorCompanyId)).toEqual([port]);
    expect(await stateOf(debited.id)).toBe("batched");
    // Ni prélevé, ni écarté : aucun état d'encaissement n'est écrit sur lui.
    expect(await stateOf(transferred.id)).toBe("absent");
    expect(await ctx.prisma.billingStatement.count({ where: { payerCompanyId: quai } })).toBe(0);
  });
});
