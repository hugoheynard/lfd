import { DeliveryRoundNotFoundError } from "../../../domain/errors/delivery-round-errors.js";
import {
  LoadingPlanReader,
  type RoundVehicleLoadRow,
} from "../../../domain/ports/loading-plan.reader.js";
import type { PlanBinType } from "../../../domain/services/loading-plan.js";
import { FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import { GetDeliveryLoadingPlanHandler } from "../get-delivery-loading-plan.handler.js";
import { GetDeliveryLoadingPlanQuery } from "../get-delivery-loading-plan.query.js";
import { binRow, deliveryOrder, FixedLoading, roundRow } from "./packing-doubles.js";

const BIN_M: PlanBinType = {
  id: "bin_m",
  name: "Bac bin_m",
  isotherm: false,
  outerLengthCm: 60,
  outerWidthCm: 40,
  outerHeightCm: 25,
  maxStack: 5,
};

/** La charge du véhicule, figée ; les types relus du catalogue. */
class FixedPlanReader extends LoadingPlanReader {
  constructor(private readonly load: RoundVehicleLoadRow | null) {
    super();
  }

  vehicleLoadOf(): Promise<RoundVehicleLoadRow | null> {
    return Promise.resolve(this.load);
  }

  binTypes(ids: readonly string[]): Promise<ReadonlyMap<string, PlanBinType>> {
    return Promise.resolve(new Map(ids.includes(BIN_M.id) ? [[BIN_M.id, BIN_M]] : []));
  }
}

const ORDERS = new FixedDeliveryOrders([deliveryOrder("o1", "R-1"), deliveryOrder("o2", "R-2")]);
/** 200 × 100 × 100 cm = 2 000 L utiles, dont 300 L réfrigérés. */
const VAN: RoundVehicleLoadRow = {
  cargo: { lengthCm: 200, widthCm: 100, heightCm: 100 },
  refrigeratedLiters: 300,
  wheelArches: null,
};

function handler(load: RoundVehicleLoadRow | null = VAN): GetDeliveryLoadingPlanHandler {
  const round = roundRow("r1", [
    {
      orderId: "o1",
      bins: [
        binRow("a", "o1", { half: null, physicalBinId: null }),
        binRow("v", "o1", { half: null, physicalBinId: null, voidedAt: new Date(0) }),
      ],
    },
    { orderId: "o2", bins: [binRow("b", "o2", { half: null, physicalBinId: null })] },
  ]);
  return new GetDeliveryLoadingPlanHandler(
    new FixedLoading([round]),
    ORDERS,
    new FixedPlanReader(load),
  );
}

describe("GetDeliveryLoadingPlanHandler", () => {
  it("rend le plan : ordre inverse, bacs annulés exclus, sec dérivé du véhicule", async () => {
    const plan = await handler().execute(new GetDeliveryLoadingPlanQuery("r1"));

    expect(plan.order.map((step) => [step.reference, step.bins.map((bin) => bin.binId)])).toEqual([
      ["R-2", ["b"]],
      ["R-1", ["a"]],
    ]);
    expect(plan.volume).toEqual({
      dryLiters: 120,
      coldLiters: 0,
      dryCapacityLiters: 1700,
      coldCapacityLiters: 300,
      dryOver: false,
      coldOver: false,
    });
    expect(plan.warnings).toEqual([]);
  });

  it("refuse une tournée inconnue (404)", async () => {
    await expect(handler().execute(new GetDeliveryLoadingPlanQuery("nope"))).rejects.toBeInstanceOf(
      DeliveryRoundNotFoundError,
    );
  });
});
