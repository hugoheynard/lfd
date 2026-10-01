import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import { FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import { FixedDriverWall } from "../../__tests__/driver-wall-doubles.js";
import { GetDeliveryLoadingRoundHandler } from "../get-delivery-loading-round.handler.js";
import { GetDeliveryLoadingRoundQuery } from "../get-delivery-loading-round.query.js";
import { GetMyLoadingRoundHandler } from "../get-my-loading-round.handler.js";
import { GetMyLoadingRoundQuery } from "../get-my-loading-round.query.js";
import { binRow, deliveryOrder, FixedLoading, roundRow } from "./packing-doubles.js";

const LOADING = new FixedLoading([
  roundRow("r_1", [{ orderId: "o1", bins: [binRow("b_1", "o1")] }]),
  roundRow("r_2", [{ orderId: "o2" }]),
]);

function handler(wall: FixedDriverWall) {
  return new GetMyLoadingRoundHandler(
    wall,
    new GetDeliveryLoadingRoundHandler(
      LOADING,
      new FixedDeliveryOrders([deliveryOrder("o1", "LIV-1"), deliveryOrder("o2", "LIV-2")]),
    ),
  );
}

describe("GetMyLoadingRoundHandler — le scan de MA tournée (PL1)", () => {
  it("rend LA vue de l'écran de chargement, pour ma tournée", async () => {
    const wall = new FixedDriverWall(new Map([["r_1", "staff_paul"]]));
    const direct = await new GetDeliveryLoadingRoundHandler(
      LOADING,
      new FixedDeliveryOrders([deliveryOrder("o1", "LIV-1"), deliveryOrder("o2", "LIV-2")]),
    ).execute(new GetDeliveryLoadingRoundQuery("r_1"));

    await expect(
      handler(wall).execute(new GetMyLoadingRoundQuery("staff_paul", "r_1")),
    ).resolves.toEqual(direct);
  });

  it("🔴 la tournée d'un autre : 404 avant toute lecture du chargement", async () => {
    const wall = new FixedDriverWall(new Map([["r_2", "staff_lea"]]));

    await expect(
      handler(wall).execute(new GetMyLoadingRoundQuery("staff_paul", "r_2")),
    ).rejects.toThrow(DriverRoundNotFoundError);
    expect(wall.asked).toEqual(["staff_paul:r_2"]);
  });
});
