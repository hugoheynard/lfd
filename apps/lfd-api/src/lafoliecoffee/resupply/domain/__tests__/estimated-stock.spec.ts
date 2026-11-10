import { estimateStock } from "../estimated-stock.js";
import type { ResupplyReceipt } from "../resupply-receipt.js";
import {
  expecting,
  RESUPPLY,
  TRACE,
  unordered,
  unorderedLine,
} from "./resupply-receipt-fixtures.js";

describe("estimateStock", () => {
  it("additionne les reçus du jour, tous reçus confondus, sans compter un attendu", () => {
    const morning = expecting();
    morning.receiveAll(TRACE);
    const noon = expecting({
      ...RESUPPLY,
      id: "resupply_2",
      lines: [{ sku: "CRO", label: "Croissant", quantity: 10, saleUnit: "piece" as const }],
    });
    noon.receiveAll(TRACE);
    noon.correct("CRO", 8, TRACE);
    const notYet = expecting({ ...RESUPPLY, id: "resupply_3" });
    const rescue = unordered();
    rescue.receive(unorderedLine("BAG", 5), TRACE);
    rescue.receive(unorderedLine("PAC", 2), TRACE);

    expect(estimateStock([morning, noon, notYet, rescue], [])).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 32,
        estimatedStock: 32,
        saleUnit: "piece",
      },
      {
        sku: "PAC",
        label: "Pain au chocolat",
        receivedQuantity: 14,
        estimatedStock: 14,
        saleUnit: "piece",
      },
      {
        sku: "BAG",
        label: "Article BAG",
        receivedQuantity: 5,
        estimatedStock: 5,
        saleUnit: "piece",
      },
    ]);
  });

  it("une journée sans reçu n'a pas de stock", () => {
    expect(estimateStock([expecting()], [])).toEqual([]);
  });
});

describe("estimateStock — les prélèvements des commandes sur stock (lot L2)", () => {
  function receivedMorning(): ResupplyReceipt {
    const morning = expecting();
    morning.receiveAll(TRACE);
    return morning;
  }

  it("soustrait ce que les commandes sur stock ont pris, sans toucher au reçu", () => {
    expect(
      estimateStock(
        [receivedMorning()],
        [{ sku: "CRO", label: "Croissant", quantity: 5, saleUnit: "piece" as const }],
      ),
    ).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 24,
        estimatedStock: 19,
        saleUnit: "piece",
      },
      {
        sku: "PAC",
        label: "Pain au chocolat",
        receivedQuantity: 12,
        estimatedStock: 12,
        saleUnit: "piece",
      },
    ]);
  });

  it("additionne plusieurs prélèvements d'un même article", () => {
    const rescue = unordered();
    rescue.receive(unorderedLine("BAG", 5), TRACE);

    expect(
      estimateStock(
        [rescue],
        [
          { sku: "BAG", label: "Baguette", quantity: 2, saleUnit: "piece" as const },
          { sku: "BAG", label: "Baguette", quantity: 3, saleUnit: "piece" as const },
        ],
      ),
    ).toEqual([
      {
        sku: "BAG",
        label: "Article BAG",
        receivedQuantity: 5,
        estimatedStock: 0,
        saleUnit: "piece",
      },
    ]);
  });

  it("montre en négatif un article pris sans avoir été reçu, avec le libellé de la commande", () => {
    expect(
      estimateStock(
        [],
        [{ sku: "TAR", label: "Tartelette", quantity: 2, saleUnit: "piece" as const }],
      ),
    ).toEqual([
      {
        sku: "TAR",
        label: "Tartelette",
        receivedQuantity: 0,
        estimatedStock: -2,
        saleUnit: "piece",
      },
    ]);
  });

  it("ne déduit rien d'un reçu encore attendu : le prélèvement reste seul", () => {
    expect(
      estimateStock(
        [expecting()],
        [{ sku: "CRO", label: "Croissant", quantity: 1, saleUnit: "piece" as const }],
      ),
    ).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        receivedQuantity: 0,
        estimatedStock: -1,
        saleUnit: "piece",
      },
    ]);
  });
});
