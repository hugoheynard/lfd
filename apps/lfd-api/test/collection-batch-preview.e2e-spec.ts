/**
 * E2E du lot de prélèvement figé — **l'aperçu du mois** (PA4) : il annonce
 * ce que le lot prélèvera, sans rien écrire.
 *
 * Découpé de `collection-batches.e2e-spec.ts` le 2026-10-23 ; scène commune
 * dans `collection-batch-scene.ts`.
 */
import type { CollectionPreviewView } from "@lfd/contracts";
import { cycleAt } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import {
  BASE,
  client,
  closesAt,
  collectingEntity,
  constitute,
  ctx,
  DAY_MS,
  HALF_CENT_BON,
  mandated,
  orderOf,
  staff,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

describe("l'aperçu du mois (PA4)", () => {
  async function preview(entityId: string): Promise<CollectionPreviewView> {
    return jsonBody<CollectionPreviewView>(
      await staff().get(`${BASE}/preview?legalEntityId=${entityId}`).expect(200),
    );
  }

  async function written(): Promise<readonly number[]> {
    return Promise.all([
      ctx.prisma.collectionBatch.count(),
      ctx.prisma.orderCollection.count(),
      ctx.prisma.billingStatement.count(),
    ]);
  }

  it("annonce les montants que le lot prélève, et n'écrit rien", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    const sans = await client("Épicerie sans mandat");
    await mandated(entity, port);
    await mandated(entity, quai);
    await orderOf(port, 2, HALF_CENT_BON);
    await orderOf(port, 3, HALF_CENT_BON);
    const quaiBon = await orderOf(quai);
    await orderOf(sans);

    const view = await preview(entity);

    expect(await written()).toEqual([0, 0, 0]);
    if (view.state !== "open") {
      throw new Error(`aperçu attendu ouvert, reçu ${view.state}`);
    }
    expect(view.cycleClosesAt).toBe(cycleAt(new Date(daysAgo(0)), closesAt).closesAt.toISOString());
    expect(view.unmandatedCompanies).toEqual(["Épicerie sans mandat"]);
    expect(view.exclusions).toMatchObject([
      { companyName: "Épicerie sans mandat", reason: "no_mandate" },
    ]);
    const [batchId] = await constitute(entity);
    const lines = await ctx.prisma.collectionBatchLine.findMany({
      where: { batchId: batchId ?? "" },
    });
    const amounts = new Map(lines.map((line) => [line.debtorCompanyId, line.amountCents]));
    const previewed = new Map(view.lines.map((line) => [line.payerCompanyId, line.amountCents]));
    expect(previewed).toEqual(amounts);
    expect(previewed.get(port)).toBe(23);
    expect(view.totalCents).toBe(23 + quaiBon.totalCents);
    expect(view.ordersTotalCents).toBe(24 + quaiBon.totalCents);
    const gaps = new Map(view.lines.map((line) => [line.payerCompanyId, line.gapCents]));
    expect(gaps.get(port)).toBe(-1);
  });

  it("mise en service après la prochaine clôture : « pas encore prélevable », deux dates", async () => {
    const entity = await collectingEntity();
    const next = cycleAt(new Date(daysAgo(0)), null).closesAt;
    const floorAt = new Date(next.getTime() + DAY_MS);
    await ctx.prisma.collectionFloor.update({ where: { id: true }, data: { floorAt } });

    expect(await preview(entity)).toEqual({
      state: "not_yet_open",
      floorAt: floorAt.toISOString(),
      firstClosureAt: cycleAt(floorAt, null).closesAt.toISOString(),
    });
    expect(await written()).toEqual([0, 0, 0]);
  });
});
