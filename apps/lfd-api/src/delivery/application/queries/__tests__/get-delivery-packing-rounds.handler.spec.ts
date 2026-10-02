import { FixedOrderStates } from "../../commands/__tests__/doorstep-doubles.js";
import { FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import { GetDeliveryOrderBinsHandler } from "../get-delivery-order-bins.handler.js";
import { GetDeliveryOrderBinsQuery } from "../get-delivery-order-bins.query.js";
import { GetDeliveryPackingRoundsHandler } from "../get-delivery-packing-rounds.handler.js";
import { GetDeliveryPackingRoundsQuery } from "../get-delivery-packing-rounds.query.js";
import { binRow, deliveryOrder, FixedLoading, roundRow } from "./packing-doubles.js";

/** Le jour que `roundRow` pose — comparé à rien d'autre qu'à lui-même. */
const DAY = "2026-10-01";

const ORDERS = new FixedDeliveryOrders([
  deliveryOrder("o1", "LIV-1"),
  deliveryOrder("o2", "LIV-2"),
  deliveryOrder("o3", "LIV-3"),
]);

/**
 * o1 et o3 partagent un bac alors qu'ils ne sont pas consécutifs (o2 entre
 * eux) : leurs moitiés sont à refaire. o2 n'a aucun bac partagé.
 */
function loading(): FixedLoading {
  return new FixedLoading([
    roundRow("r1", [
      {
        orderId: "o1",
        bins: [binRow("b1", "o1", { partner: { binId: "b3", orderId: "o3" } })],
      },
      { orderId: "o2", bins: [binRow("b2", "o2", { half: null })] },
      {
        orderId: "o3",
        bins: [binRow("b3", "o3", { half: "right", partner: { binId: "b1", orderId: "o1" } })],
      },
    ]),
  ]);
}

function states(...readyIds: readonly string[]): FixedOrderStates {
  return new FixedOrderStates(
    ["o1", "o2", "o3"].map((orderId) => ({
      orderId,
      state: "open" as const,
      ready: readyIds.includes(orderId),
    })),
  );
}

describe("GetDeliveryPackingRoundsHandler — le poste de colisage par tournée (PC2)", () => {
  it("range les arrêts du DERNIER au premier, l'ordre où les bacs entrent dans le véhicule", async () => {
    const view = await new GetDeliveryPackingRoundsHandler(loading(), ORDERS, states()).execute(
      new GetDeliveryPackingRoundsQuery(DAY),
    );

    expect(view.rounds[0]?.stops.map((stop) => [stop.reference, stop.position])).toEqual([
      ["LIV-3", 3],
      ["LIV-2", 2],
      ["LIV-1", 1],
    ]);
  });

  it("compte au serveur « n prêtes sur m », d'après le commerce", async () => {
    const view = await new GetDeliveryPackingRoundsHandler(
      loading(),
      ORDERS,
      states("o1", "o3"),
    ).execute(new GetDeliveryPackingRoundsQuery(DAY));

    expect(view.rounds[0]).toMatchObject({ stopCount: 3, readyStops: 2 });
    expect(view.rounds[0]?.stops.find((stop) => stop.orderId === "o2")?.ready).toBe(false);
  });

  it("dit « à refaire » sur les deux commandes d'un bac partagé qui ne sont plus voisines", async () => {
    const view = await new GetDeliveryPackingRoundsHandler(loading(), ORDERS, states()).execute(
      new GetDeliveryPackingRoundsQuery(DAY),
    );

    expect(
      Object.fromEntries(view.rounds[0]?.stops.map((stop) => [stop.orderId, stop.binToRedo]) ?? []),
    ).toEqual({ o1: true, o2: false, o3: true });
  });

  it("rend une liste vide un jour sans tournée", async () => {
    const view = await new GetDeliveryPackingRoundsHandler(loading(), ORDERS, states()).execute(
      new GetDeliveryPackingRoundsQuery("2026-10-02"),
    );

    expect(view).toEqual({ day: "2026-10-02", rounds: [] });
  });
});

describe("GetDeliveryOrderBinsHandler — l'étiquette porte la tournée et l'arrêt (PC3)", () => {
  it("rend la tournée vivante et la position de l'arrêt de la commande", async () => {
    const view = await new GetDeliveryOrderBinsHandler(loading(), ORDERS).execute(
      new GetDeliveryOrderBinsQuery("o2"),
    );

    expect(view.round).toEqual({
      roundId: "r1",
      day: DAY,
      vehicleName: "Camionnette 1",
      passage: 1,
      position: 2,
      departedAt: null,
    });
  });

  it("rend `null` pour une commande dans aucune tournée", async () => {
    const view = await new GetDeliveryOrderBinsHandler(loading(), ORDERS).execute(
      new GetDeliveryOrderBinsQuery("o9"),
    );

    expect(view.round).toBeNull();
  });
});
