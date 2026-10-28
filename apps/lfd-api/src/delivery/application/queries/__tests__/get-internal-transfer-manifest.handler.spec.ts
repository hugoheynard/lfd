import { InternalTransferNotFoundError } from "../../../domain/errors/internal-transfer-errors.js";
import {
  FixedTransferContents,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "../../__tests__/transfer-doubles.js";
import { GetInternalTransferManifestHandler } from "../get-internal-transfer-manifest.handler.js";
import { GetInternalTransferManifestQuery } from "../get-internal-transfer-manifest.query.js";
import { frozenResupply, resupplyContentsOver } from "../../__tests__/resupply-transfer-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);

const LINES = new Map([
  ["o_1", [{ sku: "PAIN", name: "Pain", quantity: 2, saleUnit: "piece" as const }]],
  ["o_2", [{ sku: "PAIN", name: "Pain", quantity: 3, saleUnit: "piece" as const }]],
]);

function handlerOver(
  transfers: InMemoryInternalTransfers,
  contents = new FixedTransferContents(LINES),
  resupplies = resupplyContentsOver(),
) {
  return new GetInternalTransferManifestHandler(
    new InternalTransfersReaderOver(transfers),
    contents,
    resupplies,
  );
}

describe("GetInternalTransferManifestHandler — « on doit savoir ce qu'on transporte »", () => {
  it("prévu : calculé à l'instant depuis les lignes des commandes", async () => {
    const view = await handlerOver(
      new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_1", "o_2"])),
    ).execute(new GetInternalTransferManifestQuery("t_1"));

    expect(view).toMatchObject({ siteLabel: "Val Village", frozen: false, departedAt: null });
    expect(view.totals).toEqual([
      { sku: "PAIN", productName: "Pain", quantity: 5, saleUnit: "piece" },
    ]);
    expect(view.orders.items.map((item) => item.subjectId)).toEqual(["o_1", "o_2"]);
  });

  it("parti : le manifeste figé fait foi, le commerce n'est pas relu", async () => {
    const transfer = plannedTransfer("t_1", DAY, AT, ["o_1"]);
    transfer.depart(AT, () => [
      { sku: "TARTE", productName: "Tarte", quantity: 1, saleUnit: "piece" },
    ]);
    const contents = new FixedTransferContents(LINES);

    const view = await handlerOver(new InMemoryInternalTransfers(transfer), contents).execute(
      new GetInternalTransferManifestQuery("t_1"),
    );

    expect(view.frozen).toBe(true);
    expect(view.totals).toEqual([
      { sku: "TARTE", productName: "Tarte", quantity: 1, saleUnit: "piece" },
    ]);
    expect(contents.asked).toEqual([]);
  });

  it("un réassort nommé porte son nom (R1g), prévu comme parti ; sans nom, aucun", async () => {
    const transfer = plannedTransfer("t_1", DAY, AT, []);
    for (const resupplyId of ["r_named", "r_plain"]) {
      transfer.attach(
        { itemId: `i_${resupplyId}`, item: { kind: "resupply", resupplyId } },
        { siteId: "site_vv", serviceDay: DAY },
        AT,
      );
    }
    const resupplies = resupplyContentsOver([
      frozenResupply("r_named", DAY, { name: "Vitrine du matin" }),
      frozenResupply("r_plain", DAY),
    ]);
    const transfers = new InMemoryInternalTransfers(transfer);
    const query = new GetInternalTransferManifestQuery("t_1");

    const planned = await handlerOver(transfers, undefined, resupplies).execute(query);
    transfer.depart(AT, () => [
      { sku: "CRO-001", productName: "Croissant", quantity: 6, saleUnit: "piece" },
    ]);
    const departed = await handlerOver(transfers, undefined, resupplies).execute(query);

    for (const view of [planned, departed]) {
      expect(view.resupplies.items.map((item) => [item.subjectId, item.name])).toEqual([
        ["r_named", "Vitrine du matin"],
        ["r_plain", undefined],
      ]);
    }
  });

  it("une commande au poids : prévue comme partie, le manifeste dit des grammes (P6)", async () => {
    const lines = new Map([
      [
        "o_w",
        [
          { sku: "PAIN", name: "Pain", quantity: 2, saleUnit: "piece" as const },
          { sku: "SAU", name: "Saumon", quantity: 1250, saleUnit: "weight" as const },
        ],
      ],
    ]);
    const transfer = plannedTransfer("t_1", DAY, AT, ["o_w"]);
    const query = new GetInternalTransferManifestQuery("t_1");
    const expected = [
      { sku: "PAIN", productName: "Pain", quantity: 2, saleUnit: "piece" },
      { sku: "SAU", productName: "Saumon", quantity: 1250, saleUnit: "weight" },
    ];

    const planned = await handlerOver(
      new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_w"])),
      new FixedTransferContents(lines),
    ).execute(query);
    transfer.depart(AT, (item) =>
      item.kind === "order"
        ? (lines.get(item.orderId) ?? []).map((line) => ({
            sku: line.sku,
            productName: line.name,
            quantity: line.quantity,
            saleUnit: line.saleUnit,
          }))
        : undefined,
    );
    const departed = await handlerOver(
      new InMemoryInternalTransfers(transfer),
      new FixedTransferContents(new Map()),
    ).execute(query);

    expect(planned.totals).toEqual(expected);
    expect(departed.frozen).toBe(true);
    expect(departed.totals).toEqual(expected);
  });

  it("un transfert inconnu : 404 nommé", async () => {
    await expect(
      handlerOver(new InMemoryInternalTransfers()).execute(
        new GetInternalTransferManifestQuery("t_x"),
      ),
    ).rejects.toThrow(InternalTransferNotFoundError);
  });
});
