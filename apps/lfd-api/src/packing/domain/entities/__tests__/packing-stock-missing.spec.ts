import {
  MissingBeyondFreeError,
  RecoveredBeyondMissingError,
} from "../../errors/packing-problem-errors.js";
import {
  PackingStockOverdrawnError,
  ReserveShortForShopError,
  StockMoveQuantityInvalidError,
} from "../../errors/packing-shop-release-errors.js";
import { LineNotProducedYetError } from "../../errors/packing-station-errors.js";
import { PackingStock } from "../packing-stock.js";

/** Instant comparé à aucune horloge : il date une réservation, rien de plus. */
const RESERVED_AT = new Date(0);

function stock(counters: {
  readonly received: number;
  readonly packed?: number;
  readonly missing?: number;
}): PackingStock {
  return PackingStock.fromSnapshot({
    serviceDay: "2030-03-12",
    sku: "CRO",
    received: counters.received,
    returned: 0,
    packed: counters.packed ?? 0,
    sentToShop: 0,
    reservations: [],
    missing: counters.missing ?? 0,
  });
}

/** Plan des niveaux de suivi du colisage, D6 : l'absent est mis de côté. */
describe("PackingStock — le manquant", () => {
  it("met de côté : le libre baisse, le manquant monte, la photographie le porte", () => {
    const held = stock({ received: 10, packed: 4 });

    held.setAside(3, "Croissant", "piece");

    expect(held.missing).toBe(3);
    expect(held.free).toBe(3);
    expect(held.toSnapshot()).toMatchObject({ missing: 3, packed: 4, received: 10 });
  });

  it("refuse de mettre de côté plus que le libre — une pièce au bac en sort d'abord", () => {
    const held = stock({ received: 10, packed: 8 });

    expect(() => {
      held.setAside(3, "Croissant", "piece");
    }).toThrow(MissingBeyondFreeError);
    expect(held.missing).toBe(0);
  });

  it("refuse une quantité fractionnaire ou négative", () => {
    expect(() => {
      stock({ received: 10 }).setAside(-1, "Croissant", "piece");
    }).toThrow(StockMoveQuantityInvalidError);
    expect(() => {
      stock({ received: 10, missing: 2 }).recover(1.5, "Croissant", "piece");
    }).toThrow(StockMoveQuantityInvalidError);
  });

  it("rend des pièces retrouvées au libre", () => {
    const held = stock({ received: 10, missing: 4 });

    held.recover(3, "Croissant", "piece");

    expect(held.missing).toBe(1);
    expect(held.free).toBe(9);
  });

  it("refuse de rendre plus que ce qui a été mis de côté", () => {
    const held = stock({ received: 10, missing: 2 });

    expect(() => {
      held.recover(3, "Croissant", "piece");
    }).toThrow(RecoveredBeyondMissingError);
    expect(held.missing).toBe(2);
  });

  it("une commande ne prend pas une pièce mise de côté", () => {
    const held = stock({ received: 10, packed: 6, missing: 3 });

    expect(() => {
      held.take(2, "Croissant", "piece");
    }).toThrow(LineNotProducedYetError);
    held.take(1, "Croissant", "piece");
    expect(held.packed).toBe(7);
  });

  it("un retour au fournil ne rend pas une pièce mise de côté", () => {
    const held = stock({ received: 10, packed: 4, missing: 4 });

    expect(held.giveBack(10)).toBe(2);
    expect(held.returned).toBe(2);
  });

  it("l'envoi en boutique ne sort pas une pièce mise de côté", () => {
    const held = stock({ received: 10, packed: 4, missing: 4 });

    expect(() => {
      held.sendToShop(3, "Croissant");
    }).toThrow(ReserveShortForShopError);
    held.sendToShop(2, "Croissant");
    expect(held.sentToShop).toBe(2);
  });

  it("un réassort réservé ne prend pas une pièce mise de côté", () => {
    const held = stock({ received: 10, packed: 4, missing: 4 });
    held.reserve("res_1", 6, RESERVED_AT, "piece");

    expect(() => {
      held.takeForResupply("res_1", 3, "Croissant", "piece");
    }).toThrow(LineNotProducedYetError);
    expect(held.awaitingOven("res_1")).toBe(4);
  });

  it("refuse à la relecture une réserve dont le manquant la met à découvert", () => {
    expect(() => stock({ received: 10, packed: 8, missing: 3 })).toThrow(
      PackingStockOverdrawnError,
    );
  });

  it("relit une réserve d'avant le manquant comme n'en ayant aucun", () => {
    const held = PackingStock.fromSnapshot({
      serviceDay: "2030-03-12",
      sku: "CRO",
      received: 5,
      returned: 0,
      packed: 0,
      sentToShop: 0,
      reservations: [],
    });

    expect(held.missing).toBe(0);
    expect(held.free).toBe(5);
  });
});
