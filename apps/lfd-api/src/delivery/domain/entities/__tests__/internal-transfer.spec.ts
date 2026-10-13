import { InvalidServiceDayError } from "../../errors/delivery-round-errors.js";
import {
  InternalTransferCorruptedError,
  InternalTransferDepartedError,
  InternalTransferMismatchError,
} from "../../errors/internal-transfer-errors.js";
import { InternalTransfer, type ItemContents } from "../internal-transfer.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);
const SITE = { siteId: "site_vv", serviceDay: DAY } as const;

function planned(): InternalTransfer {
  return InternalTransfer.plan({
    id: "t_1",
    serviceDay: DAY,
    siteId: "site_vv",
    siteLabel: "Val Village",
    at: AT,
  });
}

function withOrders(...orderIds: readonly string[]): InternalTransfer {
  const transfer = planned();
  orderIds.forEach((orderId, index) => {
    transfer.attach(
      { itemId: `i_${String(index + 1)}`, item: { kind: "order", orderId } },
      SITE,
      AT,
    );
  });
  return transfer;
}

const CONTENTS: ItemContents = (item) =>
  item.kind !== "order"
    ? undefined
    : item.orderId === "o_1"
      ? [
          { sku: "PAIN", productName: "Pain", quantity: 2 },
          { sku: "TARTE", productName: "Tarte", quantity: 1 },
        ]
      : item.orderId === "o_2"
        ? [{ sku: "PAIN", productName: "Pain", quantity: 3 }]
        : undefined;

describe("InternalTransfer.plan", () => {
  it("ouvre un transfert prévu, vide, version 1", () => {
    expect(planned().toSnapshot()).toMatchObject({
      siteLabel: "Val Village",
      items: [],
      departedAt: null,
      manifest: [],
      version: 1,
    });
  });

  it("refuse un jour qui n'existe pas", () => {
    expect(() =>
      InternalTransfer.plan({
        id: "t",
        serviceDay: "2030-02-30",
        siteId: "s",
        siteLabel: "S",
        at: AT,
      }),
    ).toThrow(InvalidServiceDayError);
  });
});

describe("InternalTransfer.attach", () => {
  it("range une commande, une seule fois — le second ajout ne change rien", () => {
    const transfer = withOrders("o_1");

    const again = transfer.attach(
      { itemId: "i_9", item: { kind: "order", orderId: "o_1" } },
      SITE,
      LATER,
    );

    expect(again).toBe(false);
    expect(transfer.orderIds).toEqual(["o_1"]);
  });

  it("refuse un élément d'un autre site ou d'un autre jour", () => {
    expect(() =>
      planned().attach(
        { itemId: "i_1", item: { kind: "order", orderId: "o_1" } },
        { siteId: "site_vv", serviceDay: "2030-03-13" },
        AT,
      ),
    ).toThrow(InternalTransferMismatchError);
  });

  it("refuse un ajout une fois parti : on en ouvre un autre (Q-T3)", () => {
    const transfer = withOrders("o_1");
    transfer.depart(LATER, CONTENTS);

    expect(() =>
      transfer.attach({ itemId: "i_2", item: { kind: "order", orderId: "o_2" } }, SITE, LATER),
    ).toThrow(InternalTransferDepartedError);
  });

  it("porte commandes ET réassort à la fois — le genre est celui de l'élément", () => {
    const transfer = withOrders("o_1");
    transfer.attach({ itemId: "i_r", item: { kind: "refill", refillId: "rf_1" } }, SITE, AT);

    expect(transfer.heldItems.map((item) => item.kind)).toEqual(["order", "refill"]);
    expect(transfer.orderIds).toEqual(["o_1"]);
  });

  it("avance la version au premier changement d'un transfert relu", () => {
    const transfer = InternalTransfer.restore({ ...withOrders("o_1").toSnapshot(), version: 4 });

    transfer.attach({ itemId: "i_2", item: { kind: "order", orderId: "o_2" } }, SITE, LATER);
    transfer.attach({ itemId: "i_3", item: { kind: "order", orderId: "o_3" } }, SITE, LATER);

    expect(transfer.loadedVersion).toBe(4);
    expect(transfer.toSnapshot().version).toBe(5);
  });
});

describe("InternalTransfer.depart et le manifeste", () => {
  it("calcule le manifeste tant qu'il est prévu : sections et totaux par SKU", () => {
    const manifest = withOrders("o_1", "o_2").manifest(CONTENTS);

    expect(manifest.orders.totals).toEqual([
      { sku: "PAIN", productName: "Pain", quantity: 5 },
      { sku: "TARTE", productName: "Tarte", quantity: 1 },
    ]);
    expect(manifest.refills.items).toEqual([]);
    expect(manifest.totals).toEqual(manifest.orders.totals);
  });

  it("fige le manifeste au départ : une commande changée ensuite ne change rien", () => {
    const transfer = withOrders("o_1");

    expect(transfer.depart(LATER, CONTENTS)).toBe(true);
    const manifest = transfer.manifest(() => [{ sku: "AUTRE", productName: "Autre", quantity: 9 }]);

    expect(transfer.departedAt).toEqual(LATER);
    expect(manifest.totals).toEqual([
      { sku: "PAIN", productName: "Pain", quantity: 2 },
      { sku: "TARTE", productName: "Tarte", quantity: 1 },
    ]);
  });

  it("ne part qu'une fois : le premier départ fait foi", () => {
    const transfer = withOrders("o_1");
    transfer.depart(AT, CONTENTS);

    expect(transfer.depart(LATER, () => [])).toBe(false);
    expect(transfer.departedAt).toEqual(AT);
    expect(transfer.toSnapshot().manifest).toHaveLength(2);
  });

  it("un contenu inconnu part vide — le manifeste n'invente rien", () => {
    const transfer = withOrders("o_unknown");
    transfer.depart(LATER, CONTENTS);

    expect(transfer.manifest(CONTENTS).orders.items).toEqual([
      { itemId: "i_1", kind: "order", subjectId: "o_unknown", lines: [] },
    ]);
  });

  it("refuse de relire un manifeste figé sans départ", () => {
    const snapshot = withOrders("o_1").toSnapshot();

    expect(() =>
      InternalTransfer.restore({
        ...snapshot,
        manifest: [{ itemId: "i_1", sku: "PAIN", productName: "Pain", quantity: 1 }],
      }),
    ).toThrow(InternalTransferCorruptedError);
  });
});
