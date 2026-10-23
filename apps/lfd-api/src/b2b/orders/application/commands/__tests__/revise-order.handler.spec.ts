import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ORDER_REVISED } from "../../../domain/events/order-revised.event.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  CardOrderNotRevisableError,
  OrderNotRevisableError,
  OrderRevisedElsewhereError,
  RevisionIntoClosedDayError,
  UnchangedOrderRevisionError,
} from "../../../domain/errors/order-revision-errors.js";
import { PastOrderCutoffError } from "../../../domain/errors/order-errors.js";
import { ProductionPlanClosedError } from "../../../domain/errors/production-plan-closed.error.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { FixedClosedPlans, gateOf, RecordingAdmissionDesk } from "./plan-doubles.js";
import {
  AFTER_CUTOFF,
  content,
  DAY,
  FixedEngagements,
  NEXT_DAY,
  placedOrder,
  reviseScene,
} from "./revision-scene.js";

/**
 * **Modifier une commande** (plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M1) — l'orchestration du geste : le mur, la révision attendue (R7), la
 * frontière de l'annulation (R1), la carte refusée (§9), l'heure limite du
 * client, le guichet du fournil sous verrou (§9.1), l'écriture conditionnée,
 * la ligne d'encaissement, les deux faits.
 *
 * La recomposition est la VRAIE (`OrderRevising` sur `OrderComposition`) :
 * ses montants sont ceux que la passation écrirait.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const STAFF = { kind: "staff", staffId: "stf_1" } as const;

describe("ReviseOrderHandler — le geste", () => {
  it("verrouille, note au fournil, écrit, recale le compte, publie — dans cet ordre", async () => {
    const order = await placedOrder();
    const { handler, trace, revaluation, durable } = reviseScene(order);

    const result = await handler.execute(
      new ReviseOrderCommand(
        "ord_1",
        CUSTOMER,
        0,
        content({ lines: [{ sku: "VIE-001", quantity: 20 }] }),
      ),
    );

    expect(trace).toEqual([
      "lock:ord_1",
      `desk:${DAY}`,
      "save:r1",
      `revalue:${String(result.totalCents)}`,
    ]);
    expect(result).toMatchObject({
      id: "ord_1",
      revision: 1,
      previousTotalCents: order.totalCents,
    });
    // 20 × 2,00 € = 40,00 € HT − 10 % de remise de retrait = 36,00 € ; TVA 5,5 % = 1,98 €.
    expect(result.totalCents).toBe(3_798);
    expect(revaluation.revalued).toEqual([{ orderId: "ord_1", amountCents: 3_798 }]);
    expect(durable.facts.map((fact) => fact.type)).toEqual([
      ORDER_REVISED,
      "commerce.order_revised",
    ]);
    expect(durable.facts[1]?.payload).toEqual({
      orderId: "ord_1",
      revision: 1,
      routeChanged: false,
    });
  });

  it("garde le prix d'une ligne déjà présente et met une ligne nouvelle au prix du jour", async () => {
    // La ligne d'origine a été payée 1,80 € : le catalogue dit 2,00 € aujourd'hui.
    const placed = await placedOrder();
    const order = {
      ...placed,
      lines: placed.lines.map((line) => ({ ...line, unitPriceMillicents: 180_000, pricing: null })),
    };
    const { handler, revisions } = reviseScene(order);

    await handler.execute(
      new ReviseOrderCommand(
        "ord_1",
        STAFF,
        0,
        content({
          lines: [
            { sku: "VIE-001", quantity: 12 },
            { sku: "PAI-001", quantity: 1 },
          ],
        }),
      ),
    );

    const lines = revisions.saved[0]?.revision.state.lines ?? [];
    expect(lines.map((line) => [line.sku, line.quantity, line.unitPriceMillicents])).toEqual([
      ["VIE-001", 12, 180_000],
      ["PAI-001", 1, 350_000],
    ]);
  });

  it("passer du retrait à la livraison ajoute les frais de zone et retire la remise", async () => {
    const order = await placedOrder();
    const { handler, revisions, durable } = reviseScene(order);

    await handler.execute(
      new ReviseOrderCommand(
        "ord_1",
        STAFF,
        0,
        content({
          fulfillmentMethod: "delivery",
          pickupAddressId: null,
          // La zone livre à échéance : « avant 10 h », sans heure de début.
          requestedWindow: { start: null, end: "10:00" },
          deliveryAddress: {
            label: "",
            ligne1: "2 rue Neuve",
            ligne2: "",
            codePostal: "73150",
            ville: "Val d'Isère",
            pays: "France",
          },
        }),
      ),
    );

    const saved = revisions.saved[0]?.revision;
    expect(saved?.state).toMatchObject({ discountCents: 0, deliveryFeeCents: 500 });
    expect(saved?.changes).toEqual(
      expect.arrayContaining(["method", "pickup_point", "delivery_address"]),
    );
    expect(durable.facts[1]?.payload).toMatchObject({ routeChanged: true });
  });

  it("une date qui change fait tenir les DEUX journées au fournil", async () => {
    const order = await placedOrder();
    const { handler, desk } = reviseScene(order);

    await handler.execute(
      new ReviseOrderCommand("ord_1", STAFF, 0, content({ requestedDeliveryDate: NEXT_DAY })),
    );

    expect(desk.noted).toEqual([{ days: [DAY, NEXT_DAY], orderId: "ord_1", revision: 1 }]);
  });
});

describe("ReviseOrderHandler — les refus", () => {
  it("refuse une commande payable par carte, sans rien toucher", async () => {
    const order = await placedOrder({ paymentStatus: "pending", stripePaymentIntentId: "pi_1" });
    const { handler, trace } = reviseScene(order);

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", CUSTOMER, 0, content({ note: "x" }))),
    ).rejects.toThrow(CardOrderNotRevisableError);
    expect(trace).toEqual([]);
  });

  it("R7 : une révision attendue qui n'est plus la courante est refusée (409)", async () => {
    const order = await placedOrder({ revision: 2 });
    const { handler, trace } = reviseScene(order);

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 1, content({ note: "x" }))),
    ).rejects.toThrow(OrderRevisedElsewhereError);
    expect(trace).toEqual([]);
  });

  it("R7 : une révision passée ailleurs entre le premier regard et le verrou est refusée", async () => {
    const order = await placedOrder();
    const { handler, trace } = reviseScene(order, { underLock: { ...order, revision: 1 } });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, content({ note: "x" }))),
    ).rejects.toThrow(OrderRevisedElsewhereError);
    expect(trace).toEqual(["lock:ord_1"]);
  });

  it("R1 : une commande annulée sous le verrou ne se modifie plus", async () => {
    const order = await placedOrder();
    const { handler, revisions } = reviseScene(order, {
      underLock: { ...order, status: "cancelled" },
    });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, content({ note: "x" }))),
    ).rejects.toThrow(OrderNotRevisableError);
    expect(revisions.saved).toEqual([]);
  });

  it("R1 : une commande au compte déjà dans un lot de prélèvement ne se modifie plus", async () => {
    const order = await placedOrder();
    const { handler } = reviseScene(order, {
      engagements: new FixedEngagements({
        kind: "collecting",
        state: "batched",
        collectionDay: null,
        statementNumber: null,
      }),
    });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, content({ note: "x" }))),
    ).rejects.toThrow(OrderNotRevisableError);
  });

  it("§9.1 : une commande inscrite au fournil sous le verrou est refusée, rien n'est écrit", async () => {
    const order = await placedOrder();
    const { handler, revisions, durable } = reviseScene(order, { desk: "inscribed" });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, content({ note: "x" }))),
    ).rejects.toThrow("Le fournil a déjà inscrit cette commande");
    expect(revisions.saved).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("R6 : une modification qui ne change rien est refusée", async () => {
    const order = await placedOrder();
    const { handler } = reviseScene(order);

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", STAFF, 0, content())),
    ).rejects.toThrow(UnchangedOrderRevisionError);
  });

  it("le mur : un client étranger à la société ne trouve pas la commande (404)", async () => {
    const order = await placedOrder();
    const { handler } = reviseScene(order, { role: null });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", CUSTOMER, 0, content({ note: "x" }))),
    ).rejects.toThrow(OrderNotFoundError);
  });
});

describe("ReviseOrderHandler — R1 et R5, l'heure et la journée", () => {
  it("refuse le client après l'heure limite de la date de la commande", async () => {
    const order = await placedOrder();
    const { handler } = reviseScene(order, { clock: new FixedClock(AFTER_CUTOFF) });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", CUSTOMER, 0, content({ note: "x" }))),
    ).rejects.toThrow(PastOrderCutoffError);
  });

  it("laisse l'équipe modifier après l'heure limite", async () => {
    const order = await placedOrder();
    const { handler } = reviseScene(order, { clock: new FixedClock(AFTER_CUTOFF) });

    const result = await handler.execute(
      new ReviseOrderCommand("ord_1", STAFF, 0, content({ note: "Sonner" })),
    );

    expect(result.revision).toBe(1);
  });

  it("refuse de déplacer une commande vers une journée arrêtée", async () => {
    const order = await placedOrder();
    const { handler } = reviseScene(order, {
      plans: gateOf(new FixedClosedPlans([NEXT_DAY])),
    });

    await expect(
      handler.execute(
        new ReviseOrderCommand("ord_1", STAFF, 0, content({ requestedDeliveryDate: NEXT_DAY })),
      ),
    ).rejects.toThrow(RevisionIntoClosedDayError);
  });

  it("sous le verrou, une journée arrêtée entre-temps refuse le client", async () => {
    const order = await placedOrder();
    const { handler, revisions } = reviseScene(order, {
      plans: gateOf(new FixedClosedPlans(), new RecordingAdmissionDesk([DAY])),
    });

    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", CUSTOMER, 0, content({ note: "x" }))),
    ).rejects.toThrow(ProductionPlanClosedError);
    expect(revisions.saved).toEqual([]);
  });
});
