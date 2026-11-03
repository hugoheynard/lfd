import { ReceiptNotYetReceivedError } from "../../domain/resupply-receipt-errors.js";
import { CorrectReceivedResupplyLineCommand } from "../correct-received-resupply-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ReceiveUnorderedReceiptLineCommand } from "../receive-unordered-receipt-line.command.js";
import { ReceiveSiteResupplyCommand } from "../receive-site-resupply.command.js";
import { AT, AUTHOR, CRO_24, DAY, placed, SITE, setup } from "./resupply-receipt-setup.js";

/** Ce que la réception fait du reçu ensuite : l'écart corrigé, le stock du jour. */
describe("un écart après réception", () => {
  it("corrige le reçu d'une ligne ; l'attendu reste, le stock suit", async () => {
    const { resupplies, receiveResupply, correctReceived, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    await correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "resupply_1", "CRO", 20, "staff_lou"),
    );

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.receptions[0]?.lines).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        expectedQuantity: 24,
        receivedQuantity: 20,
        saleUnit: "piece",
      },
    ]);
    expect(view.stock[0]?.estimatedStock).toBe(20);
  });

  it("refusé avant « Réceptionner »", async () => {
    const { resupplies, correctReceived } = setup();
    resupplies.put(placed("resupply_1", CRO_24));

    await expect(
      correctReceived.execute(
        new CorrectReceivedResupplyLineCommand(SITE, "resupply_1", "CRO", 20, "staff_lou"),
      ),
    ).rejects.toThrow(ReceiptNotYetReceivedError);
  });
});

describe("le stock du jour", () => {
  it("additionne deux réassorts réceptionnés et le sans commande ; un attendu ne compte pas", async () => {
    const { resupplies, receiveResupply, receive, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    resupplies.put(
      placed(
        "resupply_2",
        [{ sku: "CRO", label: "Croissant", quantity: 6, saleUnit: "piece" as const }],
        {
          target: "tomorrow",
        },
      ),
    );
    resupplies.put(placed("resupply_3", CRO_24));
    resupplies.put(placed("resupply_tomorrow", CRO_24, { serviceDay: "2026-01-03" }));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_2", "staff_lou"));
    await receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 2, "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions.map((reception) => [reception.resupplyId, reception.status])).toEqual([
      ["resupply_1", "received"],
      ["resupply_2", "received"],
      ["resupply_3", "expected"],
    ]);
    expect(view.stock).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 32,
        estimatedStock: 32,
        saleUnit: "piece",
      },
    ]);
  });

  it("un réassort annulé n'est servi que s'il avait été réceptionné", async () => {
    const { resupplies, receiveResupply, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));
    resupplies.put(placed("resupply_1", CRO_24, { cancelled: { at: AT, author: AUTHOR } }));
    resupplies.put(placed("resupply_2", CRO_24, { cancelled: { at: AT, author: AUTHOR } }));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions.map((reception) => reception.resupplyId)).toEqual(["resupply_1"]);
    expect(view.stock[0]?.receivedQuantity).toBe(24);
  });
});
