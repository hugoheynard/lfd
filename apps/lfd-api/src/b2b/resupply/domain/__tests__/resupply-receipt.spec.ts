import { estimateStock } from "../estimated-stock.js";
import { type ReceivableResupply, ResupplyReceipt } from "../resupply-receipt.js";
import {
  IncompleteReceiptLineError,
  InvalidReceivedQuantityError,
  InvalidServiceDayError,
  ReceiptBoundToResupplyError,
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ReceiptNotYetReceivedError,
  ResupplyAlreadyReceivedError,
} from "../resupply-receipt-errors.js";
import { ResupplyReceiptLine } from "../resupply-receipt-line.js";

const DAY = "2026-01-02";
const TRACE = { at: new Date(0), author: { staffUserId: "staff_1", name: "Lou", role: "counter" } };
const LATER = {
  at: new Date(60_000),
  author: { staffUserId: "staff_2", name: "Max", role: "counter" },
};

const RESUPPLY: ReceivableResupply = {
  id: "resupply_1",
  siteId: "site_1",
  serviceDay: DAY,
  lines: [
    { sku: "CRO", label: "Croissant", quantity: 24 },
    { sku: "PAC", label: "Pain au chocolat", quantity: 12 },
  ],
};

function unorderedLine(sku: string, quantity: number): ResupplyReceiptLine {
  return ResupplyReceiptLine.unordered({ sku, label: `Article ${sku}`, quantity });
}

function unordered(): ResupplyReceipt {
  return ResupplyReceipt.openUnordered({ id: "u1", siteId: "site_1", serviceDay: DAY });
}

function expecting(resupply: ReceivableResupply = RESUPPLY): ResupplyReceipt {
  return ResupplyReceipt.expecting(`receipt_${resupply.id}`, resupply);
}

describe("ResupplyReceiptLine", () => {
  it("accepte zéro : rien reçu de cet article aujourd'hui", () => {
    expect(unorderedLine("CRO", 0).receivedQuantity).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])("refuse la quantité %p", (quantity) => {
    expect(() => unorderedLine("CRO", quantity)).toThrow(InvalidReceivedQuantityError);
    expect(() => ResupplyReceiptLine.expected({ sku: "CRO", label: "x", quantity })).toThrow(
      InvalidReceivedQuantityError,
    );
  });

  it("refuse une ligne sans article ni libellé", () => {
    expect(() => ResupplyReceiptLine.unordered({ sku: " ", label: "x", quantity: 1 })).toThrow(
      IncompleteReceiptLineError,
    );
    expect(() => ResupplyReceiptLine.unordered({ sku: "CRO", label: "", quantity: 1 })).toThrow(
      IncompleteReceiptLineError,
    );
  });

  it("une ligne attendue n'est pas reçue ; une correction garde attendu et libellé", () => {
    const line = ResupplyReceiptLine.expected({ sku: "CRO", label: "Croissant", quantity: 5 });
    expect(line.receivedQuantity).toBeNull();

    const corrected = line.receivedAsExpected().withReceived(4);

    expect(corrected).toMatchObject({
      label: "Croissant",
      expectedQuantity: 5,
      receivedQuantity: 4,
    });
  });
});

describe("ResupplyReceipt — le reçu d'un réassort", () => {
  it("naît attendu de la quantité demandée, rien n'est reçu", () => {
    const receipt = expecting();

    expect(receipt.status).toBe("expected");
    expect(receipt.resupplyId).toBe("resupply_1");
    expect(receipt.lines.map((line) => [line.expectedQuantity, line.receivedQuantity])).toEqual([
      [24, null],
      [12, null],
    ]);
  });

  it("« Réceptionner » recopie l'attendu en reçu pour toutes les lignes, d'un geste", () => {
    const receipt = expecting();

    receipt.receiveAll(TRACE);

    expect(receipt.status).toBe("received");
    expect(receipt.received).toBe(TRACE);
    expect(receipt.lines.map((line) => line.receivedQuantity)).toEqual([24, 12]);
  });

  it("refuse un second « Réceptionner » en nommant qui l'a fait, sans rien changer", () => {
    const receipt = expecting();
    receipt.receiveAll(TRACE);
    receipt.correct("CRO", 20, TRACE);

    expect(() => receipt.receiveAll(LATER)).toThrow(ResupplyAlreadyReceivedError);
    expect(() => receipt.receiveAll(LATER)).toThrow(/par Lou/);
    expect(receipt.lines[0]?.receivedQuantity).toBe(20);
    expect(receipt.received).toBe(TRACE);
  });

  it("refuse de corriger avant « Réceptionner » : rien n'est encore reçu", () => {
    expect(() => expecting().correct("CRO", 20, TRACE)).toThrow(ReceiptNotYetReceivedError);
  });

  it("corrige un écart après réception : le reçu change, l'attendu reste", () => {
    const receipt = expecting();
    receipt.receiveAll(TRACE);

    receipt.correct("CRO", 20, LATER);

    expect(receipt.lines[0]).toMatchObject({ expectedQuantity: 24, receivedQuantity: 20 });
    expect(receipt.lastChange).toBe(LATER);
    expect(receipt.received).toBe(TRACE);
  });

  it("n'accepte ni ajout ni retrait d'article : c'est le rôle du sans commande", () => {
    const receipt = expecting();
    receipt.receiveAll(TRACE);

    expect(() => receipt.receive(unorderedLine("BAG", 3), TRACE)).toThrow(
      ReceiptBoundToResupplyError,
    );
    expect(() => receipt.withdraw("CRO", TRACE)).toThrow(ReceiptBoundToResupplyError);
  });

  it("refuse une journée qui n'est pas AAAA-MM-JJ", () => {
    expect(() => expecting({ ...RESUPPLY, serviceDay: "02/01/2026" })).toThrow(
      InvalidServiceDayError,
    );
  });
});

describe("ResupplyReceipt — le réassort sans commande", () => {
  it("reçoit des articles dans l'ordre de saisie, reçus dès la saisie", () => {
    const receipt = unordered();

    receipt.receive(unorderedLine("CRO", 12), TRACE);
    receipt.receive(unorderedLine("PAC", 6), LATER);

    expect(receipt.status).toBe("received");
    expect(receipt.received).toBe(TRACE);
    expect(receipt.lastChange).toBe(LATER);
    expect(
      receipt.lines.map((line) => [line.sku, line.expectedQuantity, line.receivedQuantity]),
    ).toEqual([
      ["CRO", null, 12],
      ["PAC", null, 6],
    ]);
  });

  it("refuse un article déjà sur la liste plutôt que d'additionner en silence", () => {
    const receipt = unordered();
    receipt.receive(unorderedLine("CRO", 12), TRACE);

    expect(() => receipt.receive(unorderedLine("CRO", 1), TRACE)).toThrow(
      ReceiptLineAlreadyPresentError,
    );
  });

  it("corrige et retire une ligne ; refuse un article absent", () => {
    const receipt = unordered();
    receipt.receive(unorderedLine("CRO", 12), TRACE);
    receipt.receive(unorderedLine("PAC", 6), TRACE);

    receipt.correct("CRO", 10, TRACE);
    receipt.withdraw("PAC", TRACE);

    expect(receipt.lines.map((line) => line.receivedQuantity)).toEqual([10]);
    expect(() => receipt.withdraw("PAC", TRACE)).toThrow(ReceiptLineNotFoundError);
    expect(() => receipt.correct("CRO", -1, TRACE)).toThrow(InvalidReceivedQuantityError);
    expect(receipt.lines[0]?.receivedQuantity).toBe(10);
  });
});

describe("estimateStock", () => {
  it("additionne les reçus du jour, tous reçus confondus, sans compter un attendu", () => {
    const morning = expecting();
    morning.receiveAll(TRACE);
    const noon = expecting({
      ...RESUPPLY,
      id: "resupply_2",
      lines: [{ sku: "CRO", label: "Croissant", quantity: 10 }],
    });
    noon.receiveAll(TRACE);
    noon.correct("CRO", 8, TRACE);
    const notYet = expecting({ ...RESUPPLY, id: "resupply_3" });
    const rescue = unordered();
    rescue.receive(unorderedLine("BAG", 5), TRACE);
    rescue.receive(unorderedLine("PAC", 2), TRACE);

    expect(estimateStock([morning, noon, notYet, rescue])).toEqual([
      { sku: "CRO", label: "Croissant", receivedQuantity: 32, estimatedStock: 32 },
      { sku: "PAC", label: "Pain au chocolat", receivedQuantity: 14, estimatedStock: 14 },
      { sku: "BAG", label: "Article BAG", receivedQuantity: 5, estimatedStock: 5 },
    ]);
  });

  it("une journée sans reçu n'a pas de stock", () => {
    expect(estimateStock([expecting()])).toEqual([]);
  });
});
