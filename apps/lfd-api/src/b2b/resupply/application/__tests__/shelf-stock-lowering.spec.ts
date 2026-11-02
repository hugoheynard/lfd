import { ShelfStockAlreadySoldError } from "../../domain/resupply-receipt-errors.js";
import { CorrectReceivedResupplyLineCommand } from "../correct-received-resupply-line.command.js";
import { CorrectResupplyLineCommand } from "../correct-resupply-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ReceiveResupplyLineCommand } from "../receive-resupply-line.command.js";
import { ReceiveSiteResupplyCommand } from "../receive-site-resupply.command.js";
import { WithdrawResupplyLineCommand } from "../withdraw-resupply-line.command.js";
import { CRO_24, DAY, OTHER, placed, setup, SITE } from "./resupply-receipt-setup.js";

/** Le Village a reçu 24 croissants d'un réassort, et une ligne croissant à 0 sans commande. */
async function stocked() {
  const bench = setup();
  bench.resupplies.put(placed("r_cro", CRO_24));
  await bench.receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "r_cro", "s"));
  await bench.receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "CRO", 0, "s"));
  return bench;
}

describe("le reste du jour, décompté (lot L2)", () => {
  it("la réception montre le reçu moins ce que les commandes sur stock ont pris", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [{ sku: "CRO", label: "Croissant", quantity: 7 }]);

    const view = await bench.read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.stock).toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 24, estimatedStock: 17 },
    ]);
  });

  it("ne mélange pas les points : un prélèvement ailleurs ne touche pas le Village", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, OTHER, [{ sku: "CRO", label: "Croissant", quantity: 7 }]);

    await expect(bench.stock.at(SITE, DAY)).resolves.toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 24, estimatedStock: 24 },
    ]);
  });
});

describe("une baisse de reçu sous le déjà-vendu (lot L2)", () => {
  it("refuse de corriger un reçu réceptionné sous le déjà-vendu, en nommant le nombre", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [{ sku: "CRO", label: "Croissant", quantity: 12 }]);

    const refused = bench.correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "r_cro", "CRO", 11, "s"),
    );

    await expect(refused).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
    await expect(refused).rejects.toThrow("12 « Croissant » déjà vendus sur stock aujourd'hui");
    expect(bench.lock.taken).toEqual([`${DAY}:${SITE}`]);
  });

  it("accepte de corriger jusqu'au déjà-vendu, sous le verrou du stock", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [{ sku: "CRO", label: "Croissant", quantity: 12 }]);

    await bench.correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "r_cro", "CRO", 12, "s"),
    );

    expect(bench.lock.taken).toEqual([`${DAY}:${SITE}`]);
    await expect(bench.stock.at(SITE, DAY)).resolves.toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 12, estimatedStock: 0 },
    ]);
  });

  it("refuse de corriger ou de retirer une ligne sans commande quand le reste passerait sous zéro", async () => {
    const bench = await stocked();
    await bench.receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "PAC", 5, "s"));
    bench.draws.set(DAY, SITE, [{ sku: "PAC", label: "Pain au chocolat", quantity: 3 }]);

    await expect(
      bench.correct.execute(new CorrectResupplyLineCommand(SITE, DAY, "PAC", 2, "s")),
    ).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
    await expect(
      bench.withdraw.execute(new WithdrawResupplyLineCommand(SITE, DAY, "PAC", "s")),
    ).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
  });

  it("laisse retirer une ligne sans commande quand les autres reçus couvrent le déjà-vendu", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [{ sku: "CRO", label: "Croissant", quantity: 20 }]);

    await bench.withdraw.execute(new WithdrawResupplyLineCommand(SITE, DAY, "CRO", "s"));

    expect(bench.lock.taken).toEqual([`${DAY}:${SITE}`]);
  });

  it("ne refuse pas une hausse, même si le reste reste sous zéro", async () => {
    const bench = await stocked();
    await bench.receive.execute(new ReceiveResupplyLineCommand(SITE, DAY, "PAC", 1, "s"));
    bench.draws.set(DAY, SITE, [{ sku: "PAC", label: "Pain au chocolat", quantity: 4 }]);

    await bench.correct.execute(new CorrectResupplyLineCommand(SITE, DAY, "PAC", 2, "s"));

    await expect(bench.stock.at(SITE, DAY)).resolves.toContainEqual({
      sku: "PAC",
      label: "Pain au chocolat",
      receivedQuantity: 2,
      estimatedStock: -2,
    });
  });
});
