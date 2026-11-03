import {
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ResupplyArticleUnknownError,
  ResupplyReceiptChangedMeanwhileError,
  UnorderedReceiptNotTodayError,
} from "../../domain/resupply-receipt-errors.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import { CorrectUnorderedReceiptLineCommand } from "../correct-unordered-receipt-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ListResupplyArticlesHandler } from "../list-resupply-articles.handler.js";
import { ReceiveUnorderedReceiptLineCommand } from "../receive-unordered-receipt-line.command.js";
import { WithdrawUnorderedReceiptLineCommand } from "../withdraw-unordered-receipt-line.command.js";
import { AT, CATALOGUE, DAY, SITE, setup } from "./resupply-receipt-setup.js";
import { CROISSANT, PAIN_AU_CHOCOLAT, SALMON } from "./resupply-articles.js";

describe("le réassort sans commande", () => {
  it("s'ouvre au premier article, libellé lu au catalogue, auteur figé", async () => {
    const { receive, read } = setup();

    await receive.execute(
      new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou"),
    );

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.unordered).toEqual({
      lines: [{ sku: "CRO", label: "Croissant", receivedQuantity: 12, saleUnit: "piece" }],
      updatedAt: AT.toISOString(),
      updatedBy: "Lou Martin",
    });
    expect(view.stock).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 12,
        estimatedStock: 12,
        saleUnit: "piece",
      },
    ]);
  });

  it("une journée sans rien se lit vide, sans rien ouvrir", async () => {
    const { receipts, read } = setup();

    await expect(read.execute(new GetResupplyReceiptQuery(SITE, DAY))).resolves.toEqual({
      siteId: SITE,
      serviceDay: DAY,
      receptions: [],
      unordered: { lines: [], updatedAt: null, updatedBy: null },
      stock: [],
    });
    expect(receipts.all()).toEqual([]);
  });

  it("refuse un article hors du catalogue publié, un point inconnu, et un doublon", async () => {
    const { receive, receipts } = setup();

    await expect(
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "XXX", 1, "staff_lou")),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    await expect(
      receive.execute(
        new ReceiveUnorderedReceiptLineCommand("site_inconnu", DAY, "CRO", 1, "staff_lou"),
      ),
    ).rejects.toThrow(ResupplySiteUnknownError);
    expect(receipts.all()).toEqual([]);

    await receive.execute(
      new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou"),
    );
    await expect(
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 2, "staff_lou")),
    ).rejects.toThrow(ReceiptLineAlreadyPresentError);
  });

  /**
   * Décision E2 (audit final, 2026-11-03) : le même article à la même
   * quantité était refusé comme un doublon — un double clic affichait une
   * erreur pour un geste réussi.
   */
  it("le même article à la même quantité, saisi deux fois, rend succès sans rien réécrire", async () => {
    const { receive, receipts } = setup();
    await receive.execute(
      new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou"),
    );

    await expect(
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou")),
    ).resolves.toBeUndefined();
    expect(receipts.saves).toBe(1);
  });

  it("deux saisies du même article qui se croisent : la seconde relit le reçu et rend succès", async () => {
    const { receive, receipts } = setup();
    await receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "PAC", 6, "staff_lou"));
    receipts.beforeNextSave = () =>
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou"));

    await expect(
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou")),
    ).resolves.toBeUndefined();
    expect(receipts.all()[0]?.lines.map((line) => line.sku)).toEqual(["PAC", "CRO"]);
  });

  it("deux saisies du même article à des quantités différentes qui se croisent : la seconde reste refusée", async () => {
    const { receive, receipts } = setup();
    await receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "PAC", 6, "staff_lou"));
    receipts.beforeNextSave = () =>
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 10, "staff_lou"));

    await expect(
      receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou")),
    ).rejects.toThrow(ResupplyReceiptChangedMeanwhileError);
  });

  /** Décision E1 (audit final, 2026-11-03) : une saisie sans commande sur hier ou demain passait. */
  it("refuse un réassort sans commande saisi pour une autre journée qu'aujourd'hui", async () => {
    const { receive, receipts } = setup();

    for (const day of ["2026-01-01", "2026-01-03"]) {
      await expect(
        receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, day, "CRO", 1, "staff_lou")),
      ).rejects.toThrow(UnorderedReceiptNotTodayError);
    }
    expect(receipts.all()).toEqual([]);
  });

  it("corrige puis retire une ligne ; corriger un jour vide dit que la ligne n'existe pas", async () => {
    const { receive, correct, withdraw, read } = setup();
    await expect(
      correct.execute(new CorrectUnorderedReceiptLineCommand(SITE, DAY, "CRO", 1, "staff_lou")),
    ).rejects.toThrow(ReceiptLineNotFoundError);
    await receive.execute(
      new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 12, "staff_lou"),
    );
    await receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "PAC", 6, "staff_lou"));

    await correct.execute(
      new CorrectUnorderedReceiptLineCommand(SITE, DAY, "CRO", 10, "staff_lou"),
    );
    await withdraw.execute(new WithdrawUnorderedReceiptLineCommand(SITE, DAY, "PAC", "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.unordered.lines).toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 10, saleUnit: "piece" },
    ]);
  });
});

it("liste les articles proposables avec leur famille, sans prix", async () => {
  await expect(new ListResupplyArticlesHandler(CATALOGUE).execute()).resolves.toEqual([
    CROISSANT,
    PAIN_AU_CHOCOLAT,
    SALMON,
  ]);
});
