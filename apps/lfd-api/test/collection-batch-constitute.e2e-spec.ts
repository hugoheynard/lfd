/**
 * E2E du lot de prélèvement figé — **la constitution** : les bons lus (F1),
 * l'échéance figée, les montants qui suivent la facture (F2), les écartés.
 *
 * Découpé de `collection-batches.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune (entité, payeurs, bons, plancher) vit dans `collection-batch-scene.ts`.
 */
import { CollectionCalendarReader } from "../src/b2b/accounting/domain/ports/collection-calendar.reader.js";
import { CollectionCandidatesReader } from "../src/b2b/accounting/domain/ports/collection-candidates.reader.js";
import {
  depositDeadlineOf,
  frozenCollectionDay,
} from "../src/b2b/accounting/domain/services/collection-calendar.js";
import { simulateInvoiceDossier } from "../src/b2b/accounting/domain/services/invoice-dossier.js";
import { daysAgo } from "./e2e-harness.js";
import {
  BASE,
  client,
  closesAt,
  collectingEntity,
  constitute,
  ctx,
  cycle,
  DAY_MS,
  HALF_CENT_BON,
  mandated,
  orderOf,
  staff,
  stateOf,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

describe("les bons que la constitution lit (F1)", () => {
  it("portent leurs lignes figées et le taux de surtaxe, en une lecture", async () => {
    const companyId = await client("Boulangerie figée");
    const placed = await orderOf(companyId, 2, null);
    await ctx.prisma.order.update({
      where: { id: placed.id },
      data: {
        lateFeeCents: 200,
        lateFeeAdjustment: { adjustment: { mode: "amount", cents: 200 }, vatRatePercent: 5.5 },
        vatShares: [{ rate: 5.5, amountCents: 550 }],
        lines: {
          create: {
            sku: "PAIN-E2E",
            productNameSnapshot: "Pain e2e",
            unitPriceMillicents: 980_000,
            vatRate: 5.5,
            quantity: 1,
            lineTotalCents: 9_800,
          },
        },
      },
    });
    const reader = ctx.app.get(CollectionCandidatesReader);
    const floor = await ctx.app.get(CollectionCalendarReader).floor();

    const from = floor ?? closesAt;
    const orders = await reader.collectableOrders(
      from,
      closesAt,
      await reader.collectableOrderIds(from, closesAt),
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]?.frozen).toMatchObject({
      reference: placed.orderNumber,
      lateFeeCents: 200,
      lateFeeVatRate: 5.5,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      totalCents: 10_550,
      lines: [
        {
          sku: "PAIN-E2E",
          unitPriceMillicents: 980_000,
          vatRate: "5.5",
          quantity: 1,
          lineTotalCents: 9_800,
        },
      ],
    });
  });
});

describe("le lot figé", () => {
  /**
   * PA1 (plan `prelevement-automatique.md`) : l'échéance du calendrier
   * est FIGÉE sur le lot, et le fichier stocké porte la même. Attendue
   * calculée par le domaine depuis la clôture courante — aucune date écrite.
   */
  it("fige l'échéance du calendrier (N réglé, report TARGET2) et le XML porte la même", async () => {
    const entity = await collectingEntity();
    await staff()
      .put(`/admin/accounting/legal-entities/${entity}/collection-schedule`)
      .send({
        delayHours: 1,
        daysAfterClosure: 20,
        depositCutoff: { businessDaysBefore: 2, time: "16:00" },
      })
      .expect(204);
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    // D4 : jamais avant aujourd'hui + délai — calculé par le domaine.
    const expectedDay = frozenCollectionDay(closesAt, new Date(daysAgo(0)), 14, 20).day;

    const [batchId] = await constitute(entity);

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBe(expectedDay);
    expect(batch?.depositDeadline).toEqual(
      depositDeadlineOf(expectedDay, { businessDaysBefore: 2, time: "16:00" }),
    );
    const file = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect(file.text).toContain(`<ReqdColltnDt>${expectedDay}</ReqdColltnDt>`);
  });

  it("un réglage changé APRÈS la constitution ne touche pas l'échéance du lot", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    await constitute(entity);

    await staff()
      .put(`/admin/accounting/legal-entities/${entity}/collection-schedule`)
      .send({ delayHours: 1, daysAfterClosure: 30, depositCutoff: null })
      .expect(204);

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBe(
      frozenCollectionDay(closesAt, new Date(daysAgo(0)), 14, null).day,
    );
    expect(batch?.depositDeadline).toBeNull();
  });

  it("un lot d'avant le calendrier garde une échéance nulle — jamais inventée", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    const [batchId] = await constitute(entity);
    await ctx.prisma.collectionBatch.update({
      where: { id: batchId ?? "" },
      data: { requestedCollectionDay: null },
    });

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBeNull();
  });

  it("la commande validée APRÈS la constitution, même datée avant la clôture, attend le lot suivant", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    await constitute(entity);

    const late = await orderOf(port, 1);
    await constitute(entity, 409);

    expect(await stateOf(late.id)).toBe("absent");
  });

  it("un sous-compte détaché depuis sa commande est écarté `payer_detached`", async () => {
    const entity = await collectingEntity();
    const principal = await client("Club Principal");
    await mandated(entity, principal);
    const chalet = await client("Chalet Détaché", principal);
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: chalet,
        parentId: principal,
        aspect: "billing",
        validFrom: new Date(closesAt.getTime() - 20 * DAY_MS),
        validTo: new Date(Date.parse(daysAgo(0)) - 60 * 60 * 1000),
      },
    });
    const placed = await orderOf(chalet);

    await constitute(entity);

    expect((await cycle(entity)).exclusions).toMatchObject([
      { orderNumber: placed.orderNumber, reason: "payer_detached" },
    ]);
    await staff()
      .post(`${BASE}/orders/${placed.id}/settle-otherwise`)
      .send({ note: "chèque" })
      .expect(204);
    expect(await stateOf(placed.id)).toBe("settled_otherwise");
  });
});

describe("le prélèvement suit la facture (F2)", () => {
  function ctrlSumOf(xml: string): string {
    return /<CtrlSum>([^<]*)</u.exec(xml)?.[1] ?? "";
  }

  it("une ligne prélève le total de la facture de SES bons ; Σ lignes = CtrlSum ; Σ bons écrit", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    await mandated(entity, port);
    await mandated(entity, quai);
    await orderOf(port, 2, HALF_CENT_BON);
    await orderOf(port, 3, HALF_CENT_BON);
    await orderOf(quai);
    const reader = ctx.app.get(CollectionCandidatesReader);
    const from = (await ctx.app.get(CollectionCalendarReader).floor()) ?? closesAt;
    const read = await reader.collectableOrders(
      from,
      closesAt,
      await reader.collectableOrderIds(from, closesAt),
    );
    const expectedOf = (companyId: string): number =>
      simulateInvoiceDossier(read.filter((o) => o.companyId === companyId).map((o) => o.frozen))
        .invoice.totalCents;

    const [batchId] = await constitute(entity);

    const lines = await ctx.prisma.collectionBatchLine.findMany({
      where: { batchId: batchId ?? "" },
    });
    const byDebtor = new Map(lines.map((line) => [line.debtorCompanyId, line]));
    expect(byDebtor.get(port)).toMatchObject({
      amountCents: expectedOf(port),
      ordersTotalCents: 24,
    });
    expect(expectedOf(port)).toBe(23);
    expect(byDebtor.get(quai)).toMatchObject({
      amountCents: expectedOf(quai),
      ordersTotalCents: 10_550,
    });
    const total = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const xml = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect(ctrlSumOf(xml.text)).toBe((total / 100).toFixed(2));
    const view = await cycle(entity);
    expect(view.batches[0]?.totalCents).toBe(total);
    const csv = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/audit.csv`)
      .expect(200);
    expect(csv.text).toContain('"Σ bons (€)";"Écart (€)"');
    expect(csv.text).toContain("0,23;0,24;-0,01");
  });

  it("un bon incohérent est écarté `unbillable`, les autres partent", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    await mandated(entity, port);
    await mandated(entity, quai);
    const sound = await orderOf(port);
    const broken = await orderOf(port, 3);
    await ctx.prisma.order.update({ where: { id: broken.id }, data: { totalCents: 10_549 } });
    const other = await orderOf(quai);

    await constitute(entity);

    expect((await cycle(entity)).exclusions).toMatchObject([
      { orderNumber: broken.orderNumber, reason: "unbillable" },
    ]);
    expect(await stateOf(broken.id)).toBe("excluded");
    expect(await stateOf(sound.id)).toBe("batched");
    expect(await stateOf(other.id)).toBe("batched");
  });

  /**
   * Régression (2026-10-08) : un plancher posé APRÈS la clôture du cycle
   * constitué faisait répondre « aucune commande à prélever ».
   */
  it("plancher après la clôture : 409 `not_yet_open`, pas « aucune commande »", async () => {
    const entity = await collectingEntity();
    await ctx.prisma.collectionFloor.update({
      where: { id: true },
      data: { floorAt: new Date(closesAt.getTime() + DAY_MS) },
    });
    const response = await staff()
      .post(`${BASE}/batches`)
      .send({ legalEntityId: entity })
      .expect(409);
    expect(JSON.stringify(response.body)).toContain("accounting.collection.not_yet_open");
  });
});
