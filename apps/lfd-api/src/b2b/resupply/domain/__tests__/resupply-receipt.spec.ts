import { estimateStock } from "../estimated-stock.js";
import { ResupplyReceipt } from "../resupply-receipt.js";
import {
  IncompleteReceiptLineError,
  InvalidReceivedQuantityError,
  InvalidServiceDayError,
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
} from "../resupply-receipt-errors.js";
import { ResupplyReceiptLine } from "../resupply-receipt-line.js";

const TRACE = { at: new Date(0), author: { staffUserId: "staff_1", name: "Lou", role: "counter" } };

function line(sku: string, quantity: number): ResupplyReceiptLine {
  return ResupplyReceiptLine.of({ sku, label: `Article ${sku}`, quantity });
}

function opened(): ResupplyReceipt {
  return ResupplyReceipt.open({ id: "r1", siteId: "site_1", serviceDay: "2026-01-02" });
}

describe("ResupplyReceiptLine", () => {
  it("accepte zéro : rien reçu de cet article aujourd'hui", () => {
    expect(line("CRO", 0).quantity).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])("refuse la quantité %p", (quantity) => {
    expect(() => line("CRO", quantity)).toThrow(InvalidReceivedQuantityError);
  });

  it("refuse une ligne sans article ni libellé", () => {
    expect(() => ResupplyReceiptLine.of({ sku: " ", label: "x", quantity: 1 })).toThrow(
      IncompleteReceiptLineError,
    );
    expect(() => ResupplyReceiptLine.of({ sku: "CRO", label: "", quantity: 1 })).toThrow(
      IncompleteReceiptLineError,
    );
  });

  it("une correction garde le libellé figé à la saisie", () => {
    const corrected = line("CRO", 3).withQuantity(5);
    expect(corrected).toMatchObject({ sku: "CRO", label: "Article CRO", quantity: 5 });
  });
});

describe("ResupplyReceipt", () => {
  it("refuse une journée qui n'est pas AAAA-MM-JJ", () => {
    expect(() =>
      ResupplyReceipt.open({ id: "r1", siteId: "site_1", serviceDay: "02/01/2026" }),
    ).toThrow(InvalidServiceDayError);
  });

  it("reçoit des articles dans l'ordre de saisie, et garde la trace du geste", () => {
    const receipt = opened();
    receipt.receive(line("CRO", 12), TRACE);
    receipt.receive(line("PAC", 6), TRACE);

    expect(receipt.lines.map((l) => [l.sku, l.quantity])).toEqual([
      ["CRO", 12],
      ["PAC", 6],
    ]);
    expect(receipt.lastChange).toBe(TRACE);
  });

  it("refuse un article déjà sur la liste plutôt que d'additionner en silence", () => {
    const receipt = opened();
    receipt.receive(line("CRO", 12), TRACE);

    expect(() => receipt.receive(line("CRO", 3), TRACE)).toThrow(ReceiptLineAlreadyPresentError);
    expect(receipt.lines).toHaveLength(1);
  });

  it("corrige et retire une ligne", () => {
    const receipt = opened();
    receipt.receive(line("CRO", 12), TRACE);
    receipt.receive(line("PAC", 6), TRACE);

    receipt.correct("CRO", 10, TRACE);
    receipt.withdraw("PAC", TRACE);

    expect(receipt.lines.map((l) => [l.sku, l.quantity])).toEqual([["CRO", 10]]);
  });

  it("refuse de corriger une quantité négative, sans rien changer", () => {
    const receipt = opened();
    receipt.receive(line("CRO", 12), TRACE);

    expect(() => receipt.correct("CRO", -2, TRACE)).toThrow(InvalidReceivedQuantityError);
    expect(receipt.lines[0]?.quantity).toBe(12);
  });

  it("refuse de toucher un article absent de la liste", () => {
    expect(() => opened().correct("CRO", 1, TRACE)).toThrow(ReceiptLineNotFoundError);
    expect(() => opened().withdraw("CRO", TRACE)).toThrow(ReceiptLineNotFoundError);
  });
});

describe("estimateStock", () => {
  /**
   * Les commandes déjà passées pour ce jour ne s'y soustraient pas : passées la
   * veille avant l'heure limite, le fournil les a fabriquées pour elles (Hugo,
   * 2026-10-21). Tant que le circuit « jour même sur stock » n'existe pas
   * (J2), le stock estimé est le reçu.
   */
  it("vaut le reçu tant qu'aucune commande ne puise dans la vitrine", () => {
    expect(estimateStock([line("CRO", 12), line("PAC", 0)])).toEqual([
      { sku: "CRO", label: "Article CRO", receivedQuantity: 12, estimatedStock: 12 },
      { sku: "PAC", label: "Article PAC", receivedQuantity: 0, estimatedStock: 0 },
    ]);
  });
});
