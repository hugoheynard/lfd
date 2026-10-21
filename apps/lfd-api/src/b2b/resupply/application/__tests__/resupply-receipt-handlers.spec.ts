import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import { CorrectResupplyLineCommand } from "../correct-resupply-line.command.js";
import { CorrectResupplyLineHandler } from "../correct-resupply-line.handler.js";
import { GetResupplyReceiptHandler } from "../get-resupply-receipt.handler.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ListResupplyArticlesHandler } from "../list-resupply-articles.handler.js";
import { ReceiveResupplyLineCommand } from "../receive-resupply-line.command.js";
import { ReceiveResupplyLineHandler } from "../receive-resupply-line.handler.js";
import { WithdrawResupplyLineCommand } from "../withdraw-resupply-line.command.js";
import { WithdrawResupplyLineHandler } from "../withdraw-resupply-line.handler.js";
import { Catalogue, Directory, InMemoryReceipts, Sites } from "./resupply-doubles.js";

const AT = new Date(0);
const SITE = "site_village";
const DAY = "2026-01-02";
const CATALOGUE = new Catalogue([
  { sku: "CRO", name: "Croissant" },
  { sku: "PAC", name: "Pain au chocolat" },
]);

function setup(identity = { name: "Lou Martin", role: "counter" }) {
  const receipts = new InMemoryReceipts();
  const staff = new Directory(identity);
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  return {
    receipts,
    receive: new ReceiveResupplyLineHandler(
      receipts,
      CATALOGUE,
      new Sites([SITE]),
      staff,
      clock,
      new FixedIdGenerator("receipt"),
      uow,
    ),
    correct: new CorrectResupplyLineHandler(receipts, staff, clock, uow),
    withdraw: new WithdrawResupplyLineHandler(receipts, staff, clock, uow),
    read: new GetResupplyReceiptHandler(receipts),
  };
}

describe("la réception du réapprovisionnement", () => {
  it("ouvre la réception au premier article, libellé lu au catalogue, auteur figé", async () => {
    const { receive, read } = setup();

    await receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "CRO", 12, "staff_lou"));

    await expect(read.execute(new GetResupplyReceiptQuery(SITE, DAY))).resolves.toEqual({
      siteId: SITE,
      serviceDay: DAY,
      lines: [{ sku: "CRO", label: "Croissant", receivedQuantity: 12, estimatedStock: 12 }],
      updatedAt: AT.toISOString(),
      updatedBy: "Lou Martin",
    });
  });

  it("une journée sans saisie se lit vide, sans rien ouvrir", async () => {
    const { receipts, read } = setup();

    await expect(read.execute(new GetResupplyReceiptQuery(SITE, DAY))).resolves.toEqual({
      siteId: SITE,
      serviceDay: DAY,
      lines: [],
      updatedAt: null,
      updatedBy: null,
    });
    expect(receipts.saved).toEqual([]);
  });

  it("refuse un article hors du catalogue publié, et un point de retrait inconnu", async () => {
    const { receive, receipts } = setup();

    await expect(
      receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "XXX", 1, "staff_lou")),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    await expect(
      receive.execute(new ReceiveResupplyLineCommand("site_inconnu", DAY, "CRO", 1, "staff_lou")),
    ).rejects.toThrow(ResupplySiteUnknownError);
    expect(receipts.saved).toEqual([]);
  });

  it("refuse le même article deux fois", async () => {
    const { receive } = setup();
    await receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "CRO", 12, "staff_lou"));

    await expect(
      receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "CRO", 2, "staff_lou")),
    ).rejects.toThrow(ReceiptLineAlreadyPresentError);
  });

  it("corrige puis retire une ligne", async () => {
    const { receive, correct, withdraw, read } = setup();
    await receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "CRO", 12, "staff_lou"));
    await receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "PAC", 6, "staff_lou"));

    await correct.execute(new CorrectResupplyLineCommand(SITE, DAY, "CRO", 10, "staff_lou"));
    await withdraw.execute(new WithdrawResupplyLineCommand(SITE, DAY, "PAC", "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.lines).toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 10, estimatedStock: 10 },
    ]);
  });

  it("corriger une journée sans réception dit que la ligne n'existe pas", async () => {
    const { correct } = setup();

    await expect(
      correct.execute(new CorrectResupplyLineCommand(SITE, DAY, "CRO", 1, "staff_lou")),
    ).rejects.toThrow(ReceiptLineNotFoundError);
  });

  it("liste les articles proposables, sans prix", async () => {
    await expect(new ListResupplyArticlesHandler(CATALOGUE).execute()).resolves.toEqual([
      { sku: "CRO", name: "Croissant" },
      { sku: "PAC", name: "Pain au chocolat" },
    ]);
  });
});
