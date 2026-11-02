import {
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import { CorrectUnorderedReceiptLineCommand } from "../correct-unordered-receipt-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ListResupplyArticlesHandler } from "../list-resupply-articles.handler.js";
import { ReceiveUnorderedReceiptLineCommand } from "../receive-unordered-receipt-line.command.js";
import { WithdrawUnorderedReceiptLineCommand } from "../withdraw-unordered-receipt-line.command.js";
import { AT, CATALOGUE, DAY, SITE, setup } from "./resupply-receipt-setup.js";

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
    {
      sku: "CRO",
      name: "Croissant",
      categoryId: "fam_morning",
      categoryName: "Viennoiseries",
      saleUnit: "piece",
    },
    {
      sku: "PAC",
      name: "Pain au chocolat",
      categoryId: "fam_morning",
      categoryName: "Viennoiseries",
      saleUnit: "piece",
    },
    {
      sku: "SAU",
      name: "Saumon gravlax",
      categoryId: "fam_deli",
      categoryName: "Traiteur",
      saleUnit: "weight",
    },
  ]);
});
