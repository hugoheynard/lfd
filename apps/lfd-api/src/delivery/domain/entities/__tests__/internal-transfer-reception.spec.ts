import {
  InternalTransferDepartedError,
  TransferAlreadyReceivedError,
  TransferReceptionReasonRequiredError,
} from "../../errors/internal-transfer-errors.js";
import { InternalTransfer } from "../internal-transfer.js";
import { TRANSFER_RECEPTION_REASON_MAX } from "../transfer-receipt.js";

/** La réception et le retrait d'une commande (plan du transfert interne, §3, lot T2). */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);
const SITE = { siteId: "site_vv", serviceDay: DAY } as const;

function withOrders(...orderIds: readonly string[]): InternalTransfer {
  const transfer = InternalTransfer.plan({
    id: "t_1",
    serviceDay: DAY,
    siteId: "site_vv",
    siteLabel: "Val Village",
    at: AT,
  });
  orderIds.forEach((orderId, index) => {
    transfer.attach(
      { itemId: `i_${String(index + 1)}`, item: { kind: "order", orderId } },
      SITE,
      AT,
    );
  });
  return transfer;
}

function departed(...orderIds: readonly string[]): InternalTransfer {
  const transfer = withOrders(...orderIds);
  transfer.depart(AT, () => []);
  return transfer;
}

describe("InternalTransfer.receive", () => {
  it("reçoit un transfert parti, sans motif : la tournée dit comment il est venu", () => {
    const transfer = departed("o_1");

    transfer.receive({ at: LATER, by: "staff_driver", reason: "  " });

    expect(transfer.status).toBe("received");
    expect(transfer.received).toEqual({ at: LATER, by: "staff_driver", reason: null });
  });

  it("reçoit à la main un transfert prévu, motif obligatoire (sortie de S3)", () => {
    const transfer = withOrders("o_1");

    expect(() => {
      transfer.receive({ at: LATER, by: "staff_counter", reason: null });
    }).toThrow(TransferReceptionReasonRequiredError);
    transfer.receive({ at: LATER, by: "staff_counter", reason: " Venu par le personnel " });

    expect(transfer.received?.reason).toBe("Venu par le personnel");
  });

  it("refuse un motif plus long que la borne", () => {
    expect(() => {
      withOrders("o_1").receive({
        at: LATER,
        by: "staff_counter",
        reason: "x".repeat(TRANSFER_RECEPTION_REASON_MAX + 1),
      });
    }).toThrow(TransferReceptionReasonRequiredError);
  });

  it("une réception, une seule", () => {
    const transfer = departed("o_1");
    transfer.receive({ at: LATER, by: "staff_driver", reason: null });

    expect(() => {
      transfer.receive({ at: LATER, by: "staff_counter", reason: null });
    }).toThrow(TransferAlreadyReceivedError);
  });

  it("reçu à la main, il ne part plus et ne reçoit plus rien (B2 du §12.3)", () => {
    const transfer = withOrders("o_1");
    transfer.receive({ at: LATER, by: "staff_counter", reason: "Pas de tournée ce jour" });

    expect(transfer.depart(LATER, () => [])).toBe(false);
    expect(transfer.departedAt).toBeNull();
    expect(() =>
      transfer.attach({ itemId: "i_9", item: { kind: "order", orderId: "o_9" } }, SITE, LATER),
    ).toThrow(InternalTransferDepartedError);
  });

  it("se relit tel qu'il a été reçu, et avance sa version", () => {
    const transfer = InternalTransfer.restore(departed("o_1").toSnapshot());
    transfer.receive({ at: LATER, by: "staff_driver", reason: null });

    const again = InternalTransfer.restore(transfer.toSnapshot());

    expect(again.status).toBe("received");
    expect(transfer.toSnapshot().version).toBe(2);
  });
});

describe("InternalTransfer.detachOrder", () => {
  it("sort une commande d'un transfert prévu : elle ne compte plus, ni au manifeste", () => {
    const transfer = withOrders("o_1", "o_2");

    expect(transfer.detachOrder("o_1", LATER)).toBe("detached");

    expect(transfer.orderIds).toEqual(["o_2"]);
    expect(transfer.manifest(() => []).orders.items.map((item) => item.subjectId)).toEqual(["o_2"]);
    expect(transfer.toSnapshot().items.find((item) => item.id === "i_1")?.detachedAt).toEqual(
      LATER,
    );
  });

  it("une commande sortie peut y revenir : un nouvel élément, l'ancien reste", () => {
    const transfer = withOrders("o_1");
    transfer.detachOrder("o_1", LATER);

    expect(
      transfer.attach({ itemId: "i_9", item: { kind: "order", orderId: "o_1" } }, SITE, LATER),
    ).toBe(true);
    expect(transfer.toSnapshot().items).toHaveLength(2);
  });

  it("parti ou reçu, rien ne bouge : le manifeste figé fait foi", () => {
    const transfer = departed("o_1");

    expect(transfer.detachOrder("o_1", LATER)).toBe("frozen");
    expect(transfer.orderIds).toEqual(["o_1"]);
  });

  it("une commande absente : rien", () => {
    expect(withOrders("o_1").detachOrder("o_2", LATER)).toBe("absent");
  });
});
