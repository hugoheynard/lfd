import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  BinHalfTakenError,
  SharedBinNotAdjacentError,
} from "../../../domain/errors/delivery-bin-declaration-errors.js";
import {
  BinsNotDeclarableError,
  DeliveryBinNotFoundError,
} from "../../../domain/errors/delivery-loading-errors.js";
import { DeliveryBinOffice } from "../../delivery-bin-office.js";
import { ShareDeliveryBinCommand } from "../share-delivery-bin.command.js";
import { ShareDeliveryBinHandler } from "../share-delivery-bin.handler.js";
import {
  binOf,
  binTypeOf,
  FixedBinTypeLookup,
  InMemoryBins,
  InMemoryStopLoadings,
  ScriptedDrawer,
  stopOf,
} from "./loading-doubles.js";
import { FixedManagedOrders } from "./managed-orders-double.js";
import { deliveryOn, FixedDeliveryOrders } from "./round-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const ORDERS = new FixedDeliveryOrders([
  deliveryOn("o_1", DAY),
  deliveryOn("o_2", DAY),
  deliveryOn("o_3", DAY),
  deliveryOn("o_pickup", DAY, { delivery: false }),
]);

/** La moitié gauche du bac physique `p_1`, à `o_1`. */
const LEFT = binOf("h_1", "o_1", "HHHHHH", { half: "left", physicalBinId: "p_1", innerBags: 1 });

/** La tournée `r_1` : o_1, o_2, o_3 — le chargement vu depuis `orderId`. */
function inRound(orderId: string) {
  return stopOf(orderId, { roundOrderIds: ["o_1", "o_2", "o_3"], bins: [] });
}

function sharing(
  options: { readonly bins?: InMemoryBins; readonly loadings?: InMemoryStopLoadings } = {},
) {
  const events = new RecordingPublisher();
  const bins = options.bins ?? new InMemoryBins(LEFT);
  const handler = new ShareDeliveryBinHandler(
    new DeliveryBinOffice(
      bins,
      new FixedBinTypeLookup(binTypeOf("t_m")),
      options.loadings ?? new InMemoryStopLoadings(inRound("o_2"), inRound("o_3")),
      ORDERS,
      new ScriptedDrawer(["JJJJJJ"]),
      new FixedIdGenerator("bin"),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    ),
    new FixedManagedOrders(),
  );
  return { handler, bins, events };
}

describe("ShareDeliveryBinHandler — le bac partagé (lot 4 bis, v2-4)", () => {
  it("déclare l'autre moitié pour la commande de l'arrêt voisin, et UN fait qui cite les deux", async () => {
    const { handler, bins, events } = sharing();

    const id = await handler.execute(
      new ShareDeliveryBinCommand({ orderId: "o_2", partnerBinId: "h_1", innerBags: 2 }),
    );

    expect(bins.byId.get(id)?.toSnapshot()).toMatchObject({
      orderId: "o_2",
      binTypeId: "t_m",
      half: "right",
      physicalBinId: "p_1",
      innerBags: 2,
      code: "JJJJJJ",
    });
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "delivery_bin.shared",
        subjectType: "order",
        subjectId: "o_2",
        payload: {
          subjectLabel: "CMD-o_2",
          binType: { id: "t_m", name: "Bac t_m" },
          innerBags: 2,
          bin: { id, name: "JJJJJJ" },
          half: "right",
          partner: { id: "h_1", name: "HHHHHH" },
          partnerOrder: { id: "o_1", name: "CMD-o_1" },
        },
      },
    ]);
  });

  it("refuse deux arrêts non consécutifs, sans rien écrire", async () => {
    const { handler, bins, events } = sharing();

    await expect(
      handler.execute(
        new ShareDeliveryBinCommand({ orderId: "o_3", partnerBinId: "h_1", innerBags: 0 }),
      ),
    ).rejects.toThrow(SharedBinNotAdjacentError);
    expect(bins.byId.size).toBe(1);
    expect(events.traced).toEqual([]);
  });

  it("refuse une troisième moitié : l'autre côté est déjà pris", async () => {
    const right = binOf("h_2", "o_2", "KKKKKK", { half: "right", physicalBinId: "p_1" });
    const { handler } = sharing({ bins: new InMemoryBins(LEFT, right) });

    await expect(
      handler.execute(
        new ShareDeliveryBinCommand({ orderId: "o_2", partnerBinId: "h_1", innerBags: 0 }),
      ),
    ).rejects.toThrow(BinHalfTakenError);
  });

  it("refuse une commande en retrait, et une moitié inconnue", async () => {
    const { handler } = sharing();

    await expect(
      handler.execute(
        new ShareDeliveryBinCommand({ orderId: "o_pickup", partnerBinId: "h_1", innerBags: 0 }),
      ),
    ).rejects.toThrow(BinsNotDeclarableError);
    await expect(
      handler.execute(
        new ShareDeliveryBinCommand({ orderId: "o_2", partnerBinId: "h_x", innerBags: 0 }),
      ),
    ).rejects.toThrow(DeliveryBinNotFoundError);
  });
});
