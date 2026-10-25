import {
  OrderNotRevisableError,
  PackingSheetNotYetDrawnError,
  QuantitiesOnlyAfterArrestError,
} from "../../../domain/errors/order-revision-errors.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { content, DAY, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **Changer les quantités d'une commande inscrite** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — l'orchestration : l'autorisation `staff_quantities` demandée au
 * fournil, le colisage ensuite, le BL après l'écriture, et les refus nommés.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const MORE = content({ lines: [{ sku: "VIE-001", quantity: 14 }] });
const FEWER = content({ lines: [{ sku: "VIE-001", quantity: 4 }] });

describe("ReviseOrderHandler — après l'arrêt du plan (plan A2)", () => {
  it("une hausse : fournil sous `staff_quantities`, colisage, écriture, compte, puis le BL", async () => {
    const order = await placedOrder();
    const { handler, trace, desk, packing, notes, revisions } = reviseScene(order, {
      desk: "raised",
    });

    await handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, MORE));

    expect(trace.slice(0, 4)).toEqual(["lock:ord_1", `desk:${DAY}`, `packing:${DAY}`, "save:r1"]);
    expect(desk.noted[0]).toMatchObject({
      allowance: "staff_quantities",
      lines: [{ sku: "VIE-001", quantity: 14 }],
    });
    expect(packing.revised).toEqual([
      { day: DAY, orderId: "ord_1", lines: [{ sku: "VIE-001", quantity: 14 }], by: "stf_1" },
    ]);
    expect(revisions.saved).toHaveLength(1);
    expect(notes.calls).toEqual(["follow-revision:ord_1"]);
  });

  it("une baisse : même chemin — le colisage et le BL suivent, le four n'en sait rien de plus", async () => {
    const order = await placedOrder();
    const { handler, packing, notes } = reviseScene(order, { desk: "unchanged" });

    await handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, FEWER));

    expect(packing.revised[0]?.lines).toEqual([{ sku: "VIE-001", quantity: 4 }]);
    expect(notes.calls).toEqual(["follow-revision:ord_1"]);
  });

  it("avant l'arrêt, rien ne change : la note seule, ni colisage ni BL", async () => {
    const order = await placedOrder();
    const { handler, packing, notes } = reviseScene(order);

    await handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, MORE));

    expect(packing.revised).toEqual([]);
    expect(notes.calls).toEqual([]);
  });

  it("le client n'y a pas droit : `before_inscription`, et le refus « inscrite » d'avant", async () => {
    const order = await placedOrder();
    const { handler, desk, revisions } = reviseScene(order, { desk: "raised" });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", CUSTOMER, 0, MORE)),
    ).rejects.toThrow(OrderNotRevisableError);
    expect(desk.noted[0]?.allowance).toBe("before_inscription");
    expect(revisions.saved).toEqual([]);
  });

  it("autre chose que des quantités, découvert sous le verrou du fournil : refus nommé, rien d'écrit", async () => {
    const order = await placedOrder();
    const { handler, desk, packing, revisions } = reviseScene(order, { desk: "raised" });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, content({ note: "x" }))),
    ).rejects.toThrow(QuantitiesOnlyAfterArrestError);
    expect(desk.noted[0]?.allowance).toBe("before_inscription");
    expect(packing.revised).toEqual([]);
    expect(revisions.saved).toEqual([]);
  });

  it.each([
    [
      "un article ajouté",
      content({
        lines: [
          { sku: "VIE-001", quantity: 10 },
          { sku: "PAI-001", quantity: 1 },
        ],
      }),
    ],
    ["un article remplacé", content({ lines: [{ sku: "PAI-001", quantity: 10 }] })],
    ["la note", content({ note: "Sonner" })],
    ["la date", content({ requestedDeliveryDate: "2026-11-11" })],
  ])(
    "statut déjà inscrit (`confirmed`) : %s est refusé tôt, sans toucher le fournil",
    async (_case, wanted) => {
      const order = await placedOrder({ status: "confirmed" });
      const { handler, desk } = reviseScene(order, { desk: "raised" });

      await expect(
        handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, wanted)),
      ).rejects.toThrow(QuantitiesOnlyAfterArrestError);
      expect(desk.noted).toEqual([]);
    },
  );

  it("statut déjà inscrit (`confirmed`) : les quantités passent, et s'écrivent", async () => {
    const order = await placedOrder({ status: "confirmed" });
    const { handler, revisions } = reviseScene(order, { desk: "raised" });

    await handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, MORE));

    expect(revisions.saved).toHaveLength(1);
  });

  it("la feuille du colisage n'est pas encore écrite : refus temporaire, rien d'écrit", async () => {
    const order = await placedOrder();
    const { handler, revisions, notes, durable } = reviseScene(order, {
      desk: "raised",
      packing: "sheet_missing",
    });

    await expect(handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, MORE))).rejects.toThrow(
      PackingSheetNotYetDrawnError,
    );
    expect(revisions.saved).toEqual([]);
    expect(notes.calls).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it.each([
    ["packed", "déjà fermé au colisage"],
    ["delivery_bin", "bac de livraison"],
  ] as const)("le colisage répond « %s » : refus nommé, rien d'écrit", async (outcome, words) => {
    const order = await placedOrder();
    const { handler, revisions } = reviseScene(order, { desk: "raised", packing: outcome });

    await expect(handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, MORE))).rejects.toThrow(
      words,
    );
    expect(revisions.saved).toEqual([]);
  });
});
