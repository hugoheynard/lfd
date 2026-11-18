import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { OutputCorrectedEvent } from "../../../../production/channels/packing/index.js";
import { OnOutputCorrected } from "../../handlers/on-output-corrected.handler.js";
import { CatchUpOutputCorrections } from "../catch-up-output-corrections.js";
import { ShadowCatchUpDays, correctionScene } from "./correction-doubles.js";

/**
 * D9 de `colisage/plan-niveaux-de-suivi-colisage.md` : la correction du
 * fournil baisse le reçu, le manquant d'abord, puis le libre, et sonne pour
 * le reste. `NOW` n'est comparé qu'au jour qu'il porte (le rattrapage part de
 * la veille) : la journée de la fixture en dérive.
 */
const NOW = new Date("2030-03-12T09:00:00.000Z");
const DAY = "2030-03-12";

async function sceneWith(counters: { received: number; packed?: number; missing?: number }) {
  const scene = correctionScene(NOW);
  await scene.shadow.receive({
    id: "h1",
    kind: "handoff",
    serviceDay: DAY,
    sku: "CRO",
    quantity: counters.received,
    receivedAt: NOW,
  });
  const stock = await scene.stocks.lock(DAY, "CRO");
  stock.take(counters.packed ?? 0, "Croissant", "piece");
  stock.setAside(counters.missing ?? 0, "Croissant", "piece");
  await scene.stocks.save(stock);
  return scene;
}

function corrected(total: number, handoffId = "h1") {
  return { handoffId, sku: "CRO", corrected: total };
}

describe("OutputCorrectionApplier", () => {
  it("absorbe d'abord le manquant, et le registre garde ce qui a baissé", async () => {
    const scene = await sceneWith({ received: 10, packed: 6, missing: 3 });

    expect(await scene.applier.apply(DAY, corrected(2))).toBe("applied");

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(8);
    expect(scene.stocks.missingOf(DAY, "CRO")).toBe(1);
    expect(scene.ledger.applied.get(`${DAY}/h1/CRO`)).toBe(2);
  });

  it("prend ensuite le libre, sans toucher aux sacs", async () => {
    const scene = await sceneWith({ received: 10, packed: 4, missing: 1 });

    await scene.applier.apply(DAY, corrected(4));

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(6);
    expect(scene.stocks.missingOf(DAY, "CRO")).toBe(0);
    expect(scene.stocks.packedOf(DAY, "CRO")).toBe(4);
  });

  it("sonne pour le reste, après validation, sans toucher aux commandes", async () => {
    const scene = await sceneWith({ received: 10, packed: 9 });

    await scene.applier.apply(DAY, corrected(5));

    expect(scene.stocks.packedOf(DAY, "CRO")).toBe(9);
    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(9);
    expect(scene.ledger.applied.get(`${DAY}/h1/CRO`)).toBe(1);
    expect(scene.notifier.notices).toEqual([]);
    await scene.afterCommit.commit();
    expect(scene.notifier.notices).toEqual([
      expect.objectContaining({
        kind: "packing.output_correction_uncovered",
        audience: "b2b_orders_shortfall:write",
        idempotencyKey: `correction:${DAY}:h1:CRO:5`,
        occurredAt: NOW,
      }),
    ]);
  });

  it("rejouée, ne baisse jamais deux fois", async () => {
    const scene = await sceneWith({ received: 10, packed: 2 });

    await scene.applier.apply(DAY, corrected(3));
    expect(await scene.applier.apply(DAY, corrected(3))).toBe("unchanged");

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(7);
  });

  it("n'applique que la différence d'un cumul qui grandit", async () => {
    const scene = await sceneWith({ received: 10 });

    await scene.applier.apply(DAY, corrected(2));
    await scene.applier.apply(DAY, corrected(5));

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(5);
  });

  it("ne fait jamais remonter la réserve quand le cumul baisse", async () => {
    const scene = await sceneWith({ received: 10 });

    await scene.applier.apply(DAY, corrected(4));
    expect(await scene.applier.apply(DAY, corrected(1))).toBe("unchanged");

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(6);
  });

  it("reporte une correction dont la remise n'est pas reçue", async () => {
    const scene = correctionScene(NOW);

    expect(await scene.applier.apply(DAY, corrected(2, "h_later"))).toBe("deferred");

    expect(scene.shadow.stockOf(DAY, "CRO")).toBeUndefined();
    expect(scene.ledger.applied.size).toBe(0);
  });
});

describe("OnOutputCorrected", () => {
  it("relit les cumuls de l'article et retente le reste d'une autre remise", async () => {
    const scene = await sceneWith({ received: 10, packed: 10 });
    scene.published.byDay.set(DAY, [corrected(3)]);
    const handler = new OnOutputCorrected(scene.applier);
    const fact = new OutputCorrectedEvent("pb_1", 1, DAY, "CRO", [
      { handoffId: "h1", corrected: 3, totalCorrected: 3 },
    ]).durableFact();

    await handler.handle({ eventId: "e1", type: fact.type, payload: fact.payload });
    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(10);

    // Une commande ressort du sac : le libre revient, le fait suivant retente.
    const stock = await scene.stocks.lock(DAY, "CRO");
    stock.release(2, "piece");
    await scene.stocks.save(stock);
    await handler.handle({ eventId: "e2", type: fact.type, payload: fact.payload });

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(8);
    expect(scene.ledger.applied.get(`${DAY}/h1/CRO`)).toBe(2);
  });

  it("refuse un fait illisible", async () => {
    const scene = correctionScene(NOW);
    const handler = new OnOutputCorrected(scene.applier);

    await expect(
      handler.handle({ eventId: "e1", type: "production.output_corrected", payload: {} }),
    ).rejects.toMatchObject({ code: "output_corrected.payload_invalid" });
  });
});

describe("CatchUpOutputCorrections", () => {
  it("rattrape les journées reçues depuis la veille, et rejoué ne baisse rien de plus", async () => {
    const scene = await sceneWith({ received: 10 });
    await scene.shadow.receive({
      id: "h_old",
      kind: "handoff",
      serviceDay: "2030-03-01",
      sku: "CRO",
      quantity: 5,
      receivedAt: NOW,
    });
    scene.published.byDay.set(DAY, [corrected(3)]);
    scene.published.byDay.set("2030-03-01", [corrected(2, "h_old")]);
    const catchUp = new CatchUpOutputCorrections(
      new ShadowCatchUpDays(scene.shadow),
      scene.published,
      scene.applier,
      new DirectUnitOfWork(),
      scene.clock,
    );

    expect(await catchUp.execute()).toBe(1);
    expect(await catchUp.execute()).toBe(0);

    expect(scene.shadow.stockOf(DAY, "CRO")?.received).toBe(7);
    expect(scene.shadow.stockOf("2030-03-01", "CRO")?.received).toBe(5);
  });
});
