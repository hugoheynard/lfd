import {
  ReceiptNotYetReceivedError,
  ResupplyAlreadyReceivedError,
  ResupplyNotReceivableError,
} from "../../domain/resupply-receipt-errors.js";
import { SiteResupplyNotFoundError } from "../../domain/site-resupply-errors.js";
import { StockAlert } from "../../domain/stock-alert.js";
import { CorrectReceivedResupplyLineCommand } from "../correct-received-resupply-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ReceiveResupplyLineCommand } from "../receive-resupply-line.command.js";
import { ReceiveSiteResupplyCommand } from "../receive-site-resupply.command.js";
import { AT, AUTHOR, CRO_24, DAY, OTHER, placed, SITE, setup } from "./resupply-receipt-setup.js";

describe("« Réceptionner » un réassort", () => {
  it("avant le geste, le réassort du jour est attendu et le stock est vide", async () => {
    const { resupplies, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions).toEqual([
      {
        resupplyId: "resupply_1",
        target: "asap",
        placedAt: AT.toISOString(),
        placedBy: "Lou Martin",
        status: "expected",
        receivedAt: null,
        receivedBy: null,
        lines: [{ sku: "CRO", label: "Croissant", expectedQuantity: 24, receivedQuantity: null }],
      },
    ]);
    expect(view.stock).toEqual([]);
  });

  it("recopie l'attendu en reçu, et le stock monte", async () => {
    const { resupplies, receiveResupply, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));

    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.receptions[0]).toMatchObject({
      status: "received",
      receivedAt: AT.toISOString(),
      receivedBy: "Lou Martin",
      lines: [{ sku: "CRO", expectedQuantity: 24, receivedQuantity: 24 }],
    });
    expect(view.stock).toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 24, estimatedStock: 24 },
    ]);
  });

  it("refuse un second « Réceptionner » sans rien réécrire", async () => {
    const { resupplies, receipts, receiveResupply } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    await expect(
      receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou")),
    ).rejects.toThrow(ResupplyAlreadyReceivedError);
    expect(receipts.saves).toBe(1);
  });

  it("refuse un réassort annulé, un brouillon, et celui d'un autre point (404)", async () => {
    const { resupplies, receipts, receiveResupply } = setup();
    resupplies.put(placed("resupply_cancelled", CRO_24, { cancelled: { at: AT, author: AUTHOR } }));
    resupplies.put(placed("resupply_draft", CRO_24, { placed: null }));
    resupplies.put(placed("resupply_other", CRO_24, { siteId: OTHER }));

    for (const id of ["resupply_cancelled", "resupply_draft"]) {
      await expect(
        receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, id, "staff_lou")),
      ).rejects.toThrow(ResupplyNotReceivableError);
    }
    await expect(
      receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_other", "staff_lou")),
    ).rejects.toThrow(SiteResupplyNotFoundError);
    expect(receipts.all()).toEqual([]);
  });

  it("lève l'alerte vivante de chaque article reçu au point, pas d'un article reçu à zéro", async () => {
    const { resupplies, alerts, receiveResupply, correctReceived } = setup();
    resupplies.put(
      placed("resupply_1", [
        { sku: "CRO", label: "Croissant", quantity: 24 },
        { sku: "PAC", label: "Pain au chocolat", quantity: 6 },
      ]),
    );
    const trace = { at: AT, author: AUTHOR };
    for (const [id, siteId] of [
      ["alert_cro", SITE],
      ["alert_labo", OTHER],
    ] as const) {
      await alerts.save(
        StockAlert.declare({ id, siteId, sku: "CRO", label: "Croissant", level: "low", trace }),
      );
    }

    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));
    await correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "resupply_1", "PAC", 0, "staff_lou"),
    );

    const lifted = alerts.all().map((alert) => [alert.id, alert.lifted?.reason ?? null]);
    expect(lifted).toEqual([
      ["alert_cro", "receipt"],
      ["alert_labo", null],
    ]);
  });
});

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
      { sku: "CRO", label: "Croissant", expectedQuantity: 24, receivedQuantity: 20 },
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
      placed("resupply_2", [{ sku: "CRO", label: "Croissant", quantity: 6 }], {
        target: "tomorrow",
      }),
    );
    resupplies.put(placed("resupply_3", CRO_24));
    resupplies.put(placed("resupply_tomorrow", CRO_24, { serviceDay: "2026-01-03" }));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_2", "staff_lou"));
    await receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "CRO", 2, "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions.map((reception) => [reception.resupplyId, reception.status])).toEqual([
      ["resupply_1", "received"],
      ["resupply_2", "received"],
      ["resupply_3", "expected"],
    ]);
    expect(view.stock).toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 32, estimatedStock: 32 },
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
