import { TransferArrivalStatus } from "../transfer-arrival-status.js";
import {
  FixedCarriedOrderTransfers,
  FixedTransferBinCounts,
  FixedTransferOrders,
} from "./transfer-doubles.js";

/*
 * **« Arrivée au site ? »** (plan du transfert interne, §6.1 ; lots T2, T3) :
 * le transfert qui porte la commande, ses bacs comptés, et — faille F4 — le
 * retrait d'un site servi par transfert qu'aucun transfert ne porte encore.
 */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);

function status(): TransferArrivalStatus {
  return new TransferArrivalStatus(
    new FixedCarriedOrderTransfers(
      new Map([
        ["o_carried", { transferId: "t_1", siteLabel: "Val Village", state: "departed", at: AT }],
      ]),
    ),
    new FixedTransferBinCounts(new Map([["t_1", 3]])),
    new FixedTransferOrders([
      { orderId: "o_carried", siteId: "site_vv", siteLabel: "Val Village", day: DAY },
      { orderId: "o_waiting", siteId: "site_vv", siteLabel: "Val Village", day: DAY },
    ]),
  );
}

describe("TransferArrivalStatus", () => {
  it("dit où en est le transfert d'une commande portée, et combien de bacs il emporte", async () => {
    const found = await status().statusOf(["o_carried"]);

    expect(found.get("o_carried")).toEqual({
      transferId: "t_1",
      siteLabel: "Val Village",
      state: "departed",
      at: AT,
      binCount: 3,
    });
  });

  /** Régression F4 : passée avant la clôture, la commande se remettait sans refus. */
  it("dit « en attente » d'un retrait d'un site servi par transfert qu'aucun transfert ne porte", async () => {
    const found = await status().statusOf(["o_waiting", "o_counter"]);

    expect(found.get("o_waiting")).toEqual({ state: "awaiting", siteLabel: "Val Village" });
    expect(found.has("o_counter")).toBe(false);
  });
});
