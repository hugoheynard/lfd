import {
  BinsNotDeclarableError,
  OrderBinsCarriedByTransferError,
} from "../../domain/errors/delivery-loading-errors.js";
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

/**
 * Q-T4 révisée par Hugo le 2026-10-13 (lot T3) : le lot T1 donnait un bac à
 * chaque retrait porté par un transfert ; il se met désormais en SACS, et
 * les sacs vont dans les bacs du TRANSFERT, déclarés au chargement.
 */
describe("un retrait porté par un transfert ne reçoit plus de bac à lui (lot T3, Q-T4 révisée)", () => {
  const carried = new FixedTransferredOrders(["o_village", "o_cancelled"]);

  it("refuse le retrait d'un site servi par transfert, en nommant les bacs du transfert", async () => {
    await expect(declarableReference(ORDERS, carried, "o_village")).rejects.toThrow(
      OrderBinsCarriedByTransferError,
    );
    await expect(declarableReference(ORDERS, carried, "o_village")).rejects.toThrow(
      "ses sacs vont dans les bacs du transfert",
    );
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
