import { ShelfStockAlreadySoldError } from "../../domain/resupply-receipt-errors.js";
import { CorrectReceivedResupplyLineCommand } from "../correct-received-resupply-line.command.js";
import { CorrectUnorderedReceiptLineCommand } from "../correct-unordered-receipt-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ReceiveUnorderedReceiptLineCommand } from "../receive-unordered-receipt-line.command.js";
import { ReceiveSiteResupplyCommand } from "../receive-site-resupply.command.js";
import { WithdrawUnorderedReceiptLineCommand } from "../withdraw-unordered-receipt-line.command.js";
import { CRO_24, DAY, OTHER, placed, setup, SITE } from "./resupply-receipt-setup.js";

/** Le Village a reçu 24 croissants d'un réassort, et une ligne croissant à 0 sans commande. */
async function stocked() {
  const bench = setup();
  bench.resupplies.put(placed("r_cro", CRO_24));
  await bench.receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "r_cro", "s"));
  await bench.receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "CRO", 0, "s"));
  return bench;
}

describe("le reste du jour, décompté (lot L2)", () => {
  it("la réception montre le reçu moins ce que les commandes sur stock ont pris", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [
      { sku: "CRO", label: "Croissant", quantity: 7, saleUnit: "piece" as const },
    ]);

    const view = await bench.read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.stock).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 24,
        estimatedStock: 17,
        saleUnit: "piece",
      },
    ]);
  });

  it("ne mélange pas les points : un prélèvement ailleurs ne touche pas le Village", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, OTHER, [
      { sku: "CRO", label: "Croissant", quantity: 7, saleUnit: "piece" as const },
    ]);

    await expect(bench.stock.at(SITE, DAY)).resolves.toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 24,
        estimatedStock: 24,
        saleUnit: "piece",
      },
    ]);
  });
});

describe("une baisse de reçu sous le déjà-vendu (lot L2)", () => {
  it("refuse de corriger un reçu réceptionné sous le déjà-vendu, en nommant le nombre", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [
      { sku: "CRO", label: "Croissant", quantity: 12, saleUnit: "piece" as const },
    ]);

    const refused = bench.correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "r_cro", "CRO", 11, "s"),
    );

    await expect(refused).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
    await expect(refused).rejects.toThrow("12 « Croissant » déjà vendus sur stock aujourd'hui");
    expect(bench.lock.taken).toEqual([`${DAY}:${SITE}`]);
  });

  it("accepte de corriger jusqu'au déjà-vendu, sous le verrou du stock", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [
      { sku: "CRO", label: "Croissant", quantity: 12, saleUnit: "piece" as const },
    ]);

    await bench.correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "r_cro", "CRO", 12, "s"),
    );

    expect(bench.lock.taken).toEqual([`${DAY}:${SITE}`]);
    await expect(bench.stock.at(SITE, DAY)).resolves.toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 12,
        estimatedStock: 0,
        saleUnit: "piece",
      },
    ]);
  });

  it("refuse de corriger ou de retirer une ligne sans commande quand le reste passerait sous zéro", async () => {
    const bench = await stocked();
    await bench.receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "PAC", 5, "s"));
    bench.draws.set(DAY, SITE, [
      { sku: "PAC", label: "Pain au chocolat", quantity: 3, saleUnit: "piece" as const },
    ]);

    await expect(
      bench.correct.execute(new CorrectUnorderedReceiptLineCommand(SITE, DAY, "PAC", 2, "s")),
    ).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
    await expect(
      bench.withdraw.execute(new WithdrawUnorderedReceiptLineCommand(SITE, DAY, "PAC", "s")),
    ).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
  });

  it("laisse retirer une ligne sans commande quand les autres reçus couvrent le déjà-vendu", async () => {
    const bench = await stocked();
    bench.draws.set(DAY, SITE, [
      { sku: "CRO", label: "Croissant", quantity: 20, saleUnit: "piece" as const },
    ]);

    await bench.withdraw.execute(new WithdrawUnorderedReceiptLineCommand(SITE, DAY, "CRO", "s"));

    expect(bench.lock.taken).toEqual([`${DAY}:${SITE}`]);
  });

  /** Régression M3 (audit du 2026-11-02) : le reste entier était calculé deux fois par geste. */
  it("ne lit les prélèvements qu'une fois par baisse", async () => {
    const bench = await stocked();
    bench.draws.reads = 0;

    await bench.correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "r_cro", "CRO", 20, "s"),
    );

    expect(bench.draws.reads).toBe(1);
  });

  it("ne refuse pas une hausse, même si le reste reste sous zéro", async () => {
    const bench = await stocked();
    await bench.receive.execute(new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "PAC", 1, "s"));
    bench.draws.set(DAY, SITE, [
      { sku: "PAC", label: "Pain au chocolat", quantity: 4, saleUnit: "piece" as const },
    ]);

    await bench.correct.execute(new CorrectUnorderedReceiptLineCommand(SITE, DAY, "PAC", 2, "s"));

    await expect(bench.stock.at(SITE, DAY)).resolves.toContainEqual({
      sku: "PAC",
      label: "Pain au chocolat",
      receivedQuantity: 2,
      estimatedStock: -2,
      saleUnit: "piece",
    });
  });
});

describe("le reste du jour au poids (lot L2b-1)", () => {
  /** 5 kg de saumon reçus sans commande, 1,25 kg pris par une commande sur stock. */
  async function weighed() {
    const bench = await stocked();
    await bench.receive.execute(
      new ReceiveUnorderedReceiptLineCommand(SITE, DAY, "SAU", 5000, "s"),
    );
    bench.draws.set(DAY, SITE, [
      { sku: "SAU", label: "Saumon gravlax", quantity: 1250, saleUnit: "weight" as const },
      { sku: "CRO", label: "Croissant", quantity: 3, saleUnit: "piece" as const },
    ]);
    return bench;
  }

  it("décompte des grammes, à part des pièces", async () => {
    const bench = await weighed();

    await expect(bench.stock.at(SITE, DAY)).resolves.toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 24,
        estimatedStock: 21,
        saleUnit: "piece",
      },
      {
        sku: "SAU",
        label: "Saumon gravlax",
        receivedQuantity: 5000,
        estimatedStock: 3750,
        saleUnit: "weight",
      },
    ]);
  });

  it("refuse une baisse sous le déjà-vendu en disant le poids", async () => {
    const bench = await weighed();

    const refused = bench.correct.execute(
      new CorrectUnorderedReceiptLineCommand(SITE, DAY, "SAU", 1000, "s"),
    );

    await expect(refused).rejects.toBeInstanceOf(ShelfStockAlreadySoldError);
    await expect(refused).rejects.toThrow(
      "1,25 kg « Saumon gravlax » déjà vendus sur stock aujourd'hui : le reçu ne peut pas descendre sous 1,25 kg",
    );
  });

  it("accepte une baisse jusqu'au déjà-vendu", async () => {
    const bench = await weighed();

    await bench.correct.execute(
      new CorrectUnorderedReceiptLineCommand(SITE, DAY, "SAU", 1250, "s"),
    );

    await expect(bench.stock.at(SITE, DAY)).resolves.toContainEqual({
      sku: "SAU",
      label: "Saumon gravlax",
      receivedQuantity: 1250,
      estimatedStock: 0,
      saleUnit: "weight",
    });
  });
});
