import { BinsNotDeclarableError } from "../../domain/errors/delivery-loading-errors.js";
import { deliveryOn, FixedDeliveryOrders } from "../commands/__tests__/round-doubles.js";
import { declarableReference } from "../delivery-loading-support.js";
import { FixedTransferredOrders } from "./transfer-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";

const ORDERS = new FixedDeliveryOrders([
  deliveryOn("o_village", DAY, { delivery: false }),
  deliveryOn("o_counter", DAY, { delivery: false }),
  deliveryOn("o_cancelled", DAY, { delivery: false, status: "cancelled" }),
]);

describe("un retrait porté par un transfert reçoit des bacs (lot T1, Q-T4)", () => {
  const carried = new FixedTransferredOrders(["o_village", "o_cancelled"]);

  it("accepte le retrait d'un site servi par transfert", async () => {
    await expect(declarableReference(ORDERS, carried, "o_village")).resolves.toBe("CMD-o_village");
  });

  it("refuse toujours un retrait au comptoir, et une commande annulée", async () => {
    await expect(declarableReference(ORDERS, carried, "o_counter")).rejects.toThrow(
      BinsNotDeclarableError,
    );
    await expect(declarableReference(ORDERS, carried, "o_cancelled")).rejects.toThrow(
      BinsNotDeclarableError,
    );
  });
});
