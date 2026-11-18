import { StockMoveQuantityInvalidError } from "../../errors/packing-shop-release-errors.js";
import { PackingStock } from "../packing-stock.js";

/** Instant comparé à aucune horloge : il date une réservation, rien de plus. */
const RESERVED_AT = new Date(0);

function stock(counters: {
  readonly received: number;
  readonly packed?: number;
  readonly missing?: number;
  readonly reserved?: number;
}): PackingStock {
  return PackingStock.fromSnapshot({
    serviceDay: "2030-03-12",
    sku: "CRO",
    received: counters.received,
    returned: 0,
    packed: counters.packed ?? 0,
    sentToShop: 0,
    reservations:
      counters.reserved === undefined
        ? []
        : [
            {
              resupplyId: "res_1",
              quantity: counters.reserved,
              packed: 0,
              reservedAt: RESERVED_AT,
              releasedAt: null,
            },
          ],
    missing: counters.missing ?? 0,
  });
}

/** Plan des niveaux de suivi du colisage, D9 : la correction du fournil. */
describe("PackingStock — la correction du fournil", () => {
  it("explique d'abord le manquant : le reçu et le manquant baissent ensemble", () => {
    const held = stock({ received: 10, packed: 6, missing: 3 });

    expect(held.correctReceived(2)).toEqual({ fromMissing: 2, fromFree: 0, uncovered: 0 });

    expect(held.received).toBe(8);
    expect(held.missing).toBe(1);
    expect(held.free).toBe(1);
  });

  it("puis le libre, quand le manquant ne suffit pas", () => {
    const held = stock({ received: 10, packed: 4, missing: 1 });

    expect(held.correctReceived(4)).toEqual({ fromMissing: 1, fromFree: 3, uncovered: 0 });

    expect(held.toSnapshot()).toMatchObject({ received: 6, missing: 0, packed: 4 });
  });

  it("laisse le reste quand tout est au sac : rien ne passe à découvert", () => {
    const held = stock({ received: 10, packed: 9 });

    expect(held.correctReceived(5)).toEqual({ fromMissing: 0, fromFree: 1, uncovered: 4 });

    expect(held.received).toBe(9);
    expect(() => PackingStock.fromSnapshot(held.toSnapshot())).not.toThrow();
  });

  it("ne prend pas une pièce qu'un réassort lancé retient", () => {
    const held = stock({ received: 10, packed: 2, reserved: 5 });

    expect(held.correctReceived(6)).toEqual({ fromMissing: 0, fromFree: 3, uncovered: 3 });

    expect(held.received).toBe(7);
  });

  it("refuse une quantité négative ou fractionnaire", () => {
    const held = stock({ received: 10 });

    expect(() => held.correctReceived(-1)).toThrow(StockMoveQuantityInvalidError);
    expect(() => held.correctReceived(1.5)).toThrow(StockMoveQuantityInvalidError);
  });
});
