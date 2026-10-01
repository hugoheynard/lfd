import { DeliveryRound } from "../delivery-round.js";
import { DoorstepRoundNotDepartedError } from "../../errors/delivery-doorstep-errors.js";
import {
  DeliveryStopClosedError,
  DeliveryStopNotFoundError,
} from "../../errors/delivery-round-errors.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DEPARTED = new Date(1_000);
const CLOSED = new Date(2_000);

function round(departedAt: Date | null): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleId: "v_1",
    vehicleName: "Kangoo",
    passage: 1,
    version: 3,
    departedAt,
    driverStaffId: "staff_paul",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    stops: [
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
      { id: "s_3", orderId: "o_3", position: 3, closedAt: null },
    ],
  });
}

describe("DeliveryRound.closeStop — l'exception écrite à I6 (L6-C11, AP-D2)", () => {
  it("clôt un arrêt d'une tournée partie : il garde sa position, les vivants se resserrent", () => {
    const departed = round(DEPARTED);

    departed.closeStop("s_2", CLOSED);

    const snapshot = departed.toSnapshot();
    expect(snapshot.stops).toEqual([
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_3", orderId: "o_3", position: 2, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: CLOSED },
    ]);
    expect(departed.hasClosed("s_2")).toBe(true);
    expect(departed.orderIds).toEqual(["o_1", "o_3"]);
    expect(departed.version).toBe(4);
  });

  it("une tournée relue après une clôture reste cohérente (I2 sur les seuls vivants)", () => {
    const departed = round(DEPARTED);
    departed.closeStop("s_1", CLOSED);

    const reread = DeliveryRound.restore(departed.toSnapshot());

    expect(reread.liveStops.map((stop) => stop.id)).toEqual(["s_2", "s_3"]);
    expect(reread.hasClosed("s_1")).toBe(true);
  });

  it("refuse une tournée encore au dépôt : on ne clôt qu'après le départ", () => {
    expect(() => round(null).closeStop("s_1", CLOSED)).toThrow(DoorstepRoundNotDepartedError);
  });

  it("refuse un arrêt déjà clos, et un arrêt inconnu", () => {
    const departed = round(DEPARTED);
    departed.closeStop("s_1", CLOSED);

    expect(() => departed.closeStop("s_1", CLOSED)).toThrow(DeliveryStopClosedError);
    expect(() => departed.closeStop("s_9", CLOSED)).toThrow(DeliveryStopNotFoundError);
  });

  it("un arrêt clos ne se compose toujours plus — partie, la tournée refuse le reste (I6)", () => {
    const departed = round(DEPARTED);

    expect(() => departed.reorder(["s_2", "s_1", "s_3"], CLOSED)).toThrow();
    expect(departed.hasClosed("s_1")).toBe(false);
  });
});
