import { ResupplyDayNotYetComeError } from "../../domain/resupply-receipt-errors.js";
import { ResupplyNotReceivableError } from "../../domain/site-resupply-gate-errors.js";
import {
  SiteResupplyChangedMeanwhileError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { StockAlert } from "../../domain/stock-alert.js";
import { CorrectReceivedResupplyLineCommand } from "../correct-received-resupply-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
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
        origin: "counter",
        name: null,
        placedAt: AT.toISOString(),
        placedBy: "Lou Martin",
        status: "expected",
        arrivedAt: null,
        arrivedBy: null,
        launchedAt: null,
        launchedBy: null,
        departedAt: null,
        departedBy: null,
        receivedAt: null,
        receivedBy: null,
        lines: [
          {
            sku: "CRO",
            label: "Croissant",
            expectedQuantity: 24,
            receivedQuantity: null,
            saleUnit: "piece",
          },
        ],
      },
    ]);
    expect(view.stock).toEqual([]);
  });

  /** Lot R3e : « arrivé » se lit dans la liste, et Réceptionner ne l'attend pas. */
  it("un réassort arrivé se lit « arrivé », avec l'instant et l'auteur du signal", async () => {
    const { resupplies, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24, { arrived: { at: AT, author: AUTHOR } }));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions[0]).toMatchObject({
      status: "expected",
      arrivedAt: AT.toISOString(),
      arrivedBy: "Lou Martin",
    });
  });

  it("un réassort nommé (R1g) se lit sous son nom dans la liste à réceptionner", async () => {
    const { resupplies, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24, { name: "Vitrine du matin" }));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions[0]?.name).toBe("Vitrine du matin");
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
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 24,
        estimatedStock: 24,
        saleUnit: "piece",
      },
    ]);
  });

  /**
   * Décision E2 (audit final, 2026-11-03) : un second « Réceptionner » était
   * refusé (409) — un double clic au comptoir affichait une erreur pour un
   * geste réussi. Il rend désormais succès, sans rien réécrire.
   */
  it("un second « Réceptionner » rend succès sans rien réécrire ni lever", async () => {
    const { resupplies, receipts, receiveResupply } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));
    const resupplySaves = resupplies.saves;

    await expect(
      receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou")),
    ).resolves.toBeUndefined();
    expect(receipts.saves).toBe(1);
    expect(resupplies.saves).toBe(resupplySaves);
  });

  /** Décision E2 : deux clics qui se croisent — le perdant bute sur la version, puis relit. */
  it("deux « Réceptionner » qui se croisent : le second rend succès après avoir relu la réception", async () => {
    const { resupplies, receipts, receiveResupply } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    resupplies.beforeNextSave = () =>
      receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    await expect(
      receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou")),
    ).resolves.toBeUndefined();
    expect(receipts.all()).toHaveLength(1);
  });

  it("deux gestes qui se croisent, le gagnant ayant annulé : le second reste refusé (409)", async () => {
    const { resupplies, receiveResupply } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    resupplies.beforeNextSave = () => {
      resupplies.put(
        placed("resupply_1", CRO_24, { version: 3, cancelled: { at: AT, author: AUTHOR } }),
      );
      return Promise.resolve();
    };

    await expect(
      receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou")),
    ).rejects.toThrow(SiteResupplyChangedMeanwhileError);
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

  /** Trou laissé par R2 : un réassort de demain se réceptionnait dès aujourd'hui. */
  it("refuse de réceptionner un réassort d'une journée future, sans rien écrire", async () => {
    const { resupplies, receipts, receiveResupply } = setup();
    resupplies.put(
      placed("resupply_tomorrow", CRO_24, { target: "tomorrow", serviceDay: "2026-01-03" }),
    );

    await expect(
      receiveResupply.execute(
        new ReceiveSiteResupplyCommand(SITE, "resupply_tomorrow", "staff_lou"),
      ),
    ).rejects.toThrow(ResupplyDayNotYetComeError);
    expect(receipts.all()).toEqual([]);
  });

  it("un réassort envoyé par le fournil arrive marqué, et se réceptionne en un geste (R1d)", async () => {
    const { resupplies, receiveResupply, read } = setup();
    resupplies.put(placed("resupply_bakehouse", CRO_24, { origin: "bakehouse" }));

    await receiveResupply.execute(
      new ReceiveSiteResupplyCommand(SITE, "resupply_bakehouse", "staff_lou"),
    );

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.receptions[0]).toMatchObject({ origin: "bakehouse", status: "received" });
    expect(view.stock[0]).toMatchObject({ sku: "CRO", receivedQuantity: 24 });
  });

  /**
   * Régression G1 (audit du 2026-11-02) : « Réceptionner » n'écrivait que le
   * reçu, sans toucher la version du réassort ; une annulation qui avait lu
   * « pas encore réceptionné » juste avant sauvait quand même, et le réassort
   * finissait annulé ET réceptionné.
   */
  it("une annulation lue avant « Réceptionner » échoue à l'écriture (409)", async () => {
    const { resupplies, receiveResupply } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    const readByCancel = await resupplies.load(SITE, "resupply_1");
    if (readByCancel === null) {
      throw new Error("le réassort semé est introuvable");
    }

    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    readByCancel.cancel(
      { at: AT, author: AUTHOR },
      { reception: null, planStopped: false, launched: false },
    );
    await expect(resupplies.save(readByCancel)).rejects.toThrow(SiteResupplyChangedMeanwhileError);
    expect(resupplies.all()[0]?.cancelled).toBeNull();
  });

  /** Régression M2 (audit du 2026-11-02) : une lecture des alertes vivantes par ligne reçue. */
  it("lit les alertes vivantes une seule fois pour tout le reçu", async () => {
    const { resupplies, alerts, receiveResupply } = setup();
    resupplies.put(
      placed("resupply_1", [
        { sku: "CRO", label: "Croissant", quantity: 24, saleUnit: "piece" as const },
        { sku: "PAC", label: "Pain au chocolat", quantity: 6, saleUnit: "piece" as const },
      ]),
    );

    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    expect(alerts.liveReads).toBe(1);
  });

  it("lève l'alerte vivante de chaque article reçu au point, pas d'un article reçu à zéro", async () => {
    const { resupplies, alerts, receiveResupply, correctReceived } = setup();
    resupplies.put(
      placed("resupply_1", [
        { sku: "CRO", label: "Croissant", quantity: 24, saleUnit: "piece" as const },
        { sku: "PAC", label: "Pain au chocolat", quantity: 6, saleUnit: "piece" as const },
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
