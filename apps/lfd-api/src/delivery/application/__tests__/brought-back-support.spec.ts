import { ordersToReplace } from "../brought-back-support.js";
import { FixedBroughtBackOrders } from "../commands/__tests__/brought-back-doubles.js";
import { FixedOrderStates } from "../commands/__tests__/doorstep-doubles.js";
import { deliveryOn, FixedDeliveryOrders } from "../commands/__tests__/round-doubles.js";

// Des jours et des instants comparés entre eux — jamais à l'horloge.
const DAY = "2030-03-10";
const AT = new Date("2030-03-10T15:00:00.000Z");

describe("ordersToReplace — les commandes rapportées à replacer (RL1)", () => {
  it("rend les rapportées encore à livrer, dans l'ordre du reader, et écarte ce qui ne se replace pas", async () => {
    const ids = ["o_ok", "o_cancelled", "o_counter", "o_handed", "o_unknown", "o_later"];
    const broughtBack = new FixedBroughtBackOrders(
      ids.map((orderId) => ({ orderId, broughtBackAt: AT })),
    );
    const orders = new FixedDeliveryOrders([
      deliveryOn("o_ok", DAY),
      deliveryOn("o_cancelled", DAY, { status: "cancelled" }),
      deliveryOn("o_counter", DAY, { delivery: false }),
      deliveryOn("o_handed", DAY),
      deliveryOn("o_later", "2030-03-14"),
    ]);
    const states = new FixedOrderStates([
      { orderId: "o_ok", state: "open", ready: true },
      { orderId: "o_cancelled", state: "cancelled", ready: false },
      { orderId: "o_counter", state: "open", ready: true },
      { orderId: "o_handed", state: "handed_over", ready: true },
      { orderId: "o_later", state: "open", ready: true },
    ]);

    const replaceable = await ordersToReplace(broughtBack, orders, states);

    expect(replaceable).toEqual([
      { orderId: "o_ok", reference: "CMD-o_ok", status: "active" },
      { orderId: "o_later", reference: "CMD-o_later", status: "active" },
    ]);
  });

  it("aucune rapportée : rien à relire chez le commerce", async () => {
    const replaceable = await ordersToReplace(
      new FixedBroughtBackOrders(),
      new FixedDeliveryOrders(),
      new FixedOrderStates([]),
    );

    expect(replaceable).toEqual([]);
  });
});
