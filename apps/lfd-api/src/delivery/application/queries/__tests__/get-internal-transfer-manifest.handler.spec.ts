import { InternalTransferNotFoundError } from "../../../domain/errors/internal-transfer-errors.js";
import {
  FixedTransferContents,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "../../__tests__/transfer-doubles.js";
import { GetInternalTransferManifestHandler } from "../get-internal-transfer-manifest.handler.js";
import { GetInternalTransferManifestQuery } from "../get-internal-transfer-manifest.query.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);

const LINES = new Map([
  ["o_1", [{ sku: "PAIN", name: "Pain", quantity: 2 }]],
  ["o_2", [{ sku: "PAIN", name: "Pain", quantity: 3 }]],
]);

function handlerOver(
  transfers: InMemoryInternalTransfers,
  contents = new FixedTransferContents(LINES),
) {
  return new GetInternalTransferManifestHandler(
    new InternalTransfersReaderOver(transfers),
    contents,
  );
}

describe("GetInternalTransferManifestHandler — « on doit savoir ce qu'on transporte »", () => {
  it("prévu : calculé à l'instant depuis les lignes des commandes", async () => {
    const view = await handlerOver(
      new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_1", "o_2"])),
    ).execute(new GetInternalTransferManifestQuery("t_1"));

    expect(view).toMatchObject({ siteLabel: "Val Village", frozen: false, departedAt: null });
    expect(view.totals).toEqual([{ sku: "PAIN", productName: "Pain", quantity: 5 }]);
    expect(view.orders.items.map((item) => item.subjectId)).toEqual(["o_1", "o_2"]);
  });

  it("parti : le manifeste figé fait foi, le commerce n'est pas relu", async () => {
    const transfer = plannedTransfer("t_1", DAY, AT, ["o_1"]);
    transfer.depart(AT, () => [{ sku: "TARTE", productName: "Tarte", quantity: 1 }]);
    const contents = new FixedTransferContents(LINES);

    const view = await handlerOver(new InMemoryInternalTransfers(transfer), contents).execute(
      new GetInternalTransferManifestQuery("t_1"),
    );

    expect(view.frozen).toBe(true);
    expect(view.totals).toEqual([{ sku: "TARTE", productName: "Tarte", quantity: 1 }]);
    expect(contents.asked).toEqual([]);
  });

  it("un transfert inconnu : 404 nommé", async () => {
    await expect(
      handlerOver(new InMemoryInternalTransfers()).execute(
        new GetInternalTransferManifestQuery("t_x"),
      ),
    ).rejects.toThrow(InternalTransferNotFoundError);
  });
});
