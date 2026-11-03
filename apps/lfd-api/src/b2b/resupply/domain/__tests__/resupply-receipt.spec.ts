import { ResupplyReceipt } from "../resupply-receipt.js";
import {
  IncompleteReceiptLineError,
  InvalidReceivedQuantityError,
  InvalidServiceDayError,
  ReceiptBoundToResupplyError,
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ReceiptNotBoundToResupplyError,
  ReceiptNotYetReceivedError,
  ResupplyAlreadyReceivedError,
  ResupplyDayNotYetComeError,
  UnorderedReceiptNotTodayError,
} from "../resupply-receipt-errors.js";
import { ResupplyReceiptLine } from "../resupply-receipt-line.js";

import {
  expecting,
  LATER,
  RESUPPLY,
  TRACE,
  unordered,
  unorderedLine,
} from "./resupply-receipt-fixtures.js";

describe("ResupplyReceiptLine", () => {
  it("accepte zéro : rien reçu de cet article aujourd'hui", () => {
    expect(unorderedLine("CRO", 0).receivedQuantity).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])("refuse la quantité %p", (quantity) => {
    expect(() => unorderedLine("CRO", quantity)).toThrow(InvalidReceivedQuantityError);
    expect(() =>
      ResupplyReceiptLine.expected({
        sku: "CRO",
        label: "x",
        quantity,
        saleUnit: "piece" as const,
      }),
    ).toThrow(InvalidReceivedQuantityError);
  });

  it("refuse une ligne sans article ni libellé", () => {
    expect(() =>
      ResupplyReceiptLine.unordered({
        sku: " ",
        label: "x",
        quantity: 1,
        saleUnit: "piece" as const,
      }),
    ).toThrow(IncompleteReceiptLineError);
    expect(() =>
      ResupplyReceiptLine.unordered({
        sku: "CRO",
        label: "",
        quantity: 1,
        saleUnit: "piece" as const,
      }),
    ).toThrow(IncompleteReceiptLineError);
  });

  it("une ligne attendue n'est pas reçue ; une correction garde attendu et libellé", () => {
    const line = ResupplyReceiptLine.expected({
      sku: "CRO",
      label: "Croissant",
      quantity: 5,
      saleUnit: "piece" as const,
    });
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
  /** Régression : « Réceptionner » un sans-commande vide le marquait reçu, sans aucune ligne. */
  it("refuse « Réceptionner » : un sans-commande est reçu à la saisie, pas d'un geste", () => {
    const receipt = unordered();
    expect(() => receipt.receiveAll(TRACE)).toThrow(ReceiptNotBoundToResupplyError);
    expect(receipt.status).toBe("expected");
  });

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

  /** Décision E2 (audit final, 2026-11-03) : un double clic était refusé comme un doublon. */
  it("le même article à la même quantité est le geste déjà fait : rien ne change, et il le dit", () => {
    const receipt = unordered();
    receipt.receive(unorderedLine("CRO", 12), TRACE);

    expect(receipt.receive(unorderedLine("CRO", 12), LATER)).toBe(false);
    expect(receipt.lastChange).toBe(TRACE);
    expect(receipt.lines).toHaveLength(1);
  });

  /** Décision E1 (audit final, 2026-11-03) : un sans-commande se posait sur n'importe quelle journée. */
  it("refuse une saisie posée un autre jour que celui du réassort sans commande, à l'heure de Paris", () => {
    const yesterday = ResupplyReceipt.openUnordered({
      id: "u0",
      siteId: "site_1",
      serviceDay: "2026-01-01",
    });
    // 23 h 30 le 1er janvier en UTC : déjà le 2 à Paris.
    const parisMidnight = { ...TRACE, at: new Date("2026-01-01T23:30:00Z") };

    expect(() => yesterday.receive(unorderedLine("CRO", 1), TRACE)).toThrow(
      UnorderedReceiptNotTodayError,
    );
    expect(() => yesterday.receive(unorderedLine("CRO", 1), parisMidnight)).toThrow(
      UnorderedReceiptNotTodayError,
    );
    expect(yesterday.lines).toEqual([]);
    expect(unordered().receive(unorderedLine("CRO", 1), parisMidnight)).toBe(true);
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

describe("ResupplyReceipt — pas avant sa journée (R1d)", () => {
  /** Trou laissé par R2 : un réassort de demain se réceptionnait dès ce soir. */
  it("refuse de réceptionner la veille au soir, à l'heure de Paris, et ne reçoit rien", () => {
    const receipt = expecting();
    // 23 h 30 à Paris le 1er janvier : encore la veille de la journée du réassort.
    const eve = { ...TRACE, at: new Date("2026-01-01T22:30:00Z") };

    expect(() => receipt.receiveAll(eve)).toThrow(ResupplyDayNotYetComeError);
    expect(() => receipt.receiveAll(eve)).toThrow(/2026-01-02/u);
    expect(receipt.status).toBe("expected");
  });

  it("réceptionne dès minuit à Paris, même si l'UTC est encore la veille", () => {
    const receipt = expecting();

    receipt.receiveAll({ ...TRACE, at: new Date("2026-01-01T23:30:00Z") });

    expect(receipt.status).toBe("received");
  });

  it("réceptionne un réassort d'une journée passée (arrivé, attesté en retard)", () => {
    const receipt = expecting();

    receipt.receiveAll({ ...TRACE, at: new Date("2026-01-05T08:00:00Z") });

    expect(receipt.status).toBe("received");
  });
});
