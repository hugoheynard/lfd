import {
  ReserveShopQuantityInvalidError,
  ReserveShortForShopError,
} from "../../errors/packing-shop-release-errors.js";
import { LineNotProducedYetError } from "../../errors/packing-station-errors.js";
import { PackingStock } from "../packing-stock.js";

/** Instant comparé à aucune horloge : il date une réservation, rien de plus. */
const RESERVED_AT = new Date("2026-10-25T07:00:00.000Z");

function stock(counters: {
  readonly received: number;
  readonly returned?: number;
  readonly packed?: number;
  readonly sentToShop?: number;
}): PackingStock {
  return PackingStock.fromSnapshot({
    serviceDay: "2026-10-25",
    sku: "CRO",
    received: counters.received,
    returned: counters.returned ?? 0,
    packed: counters.packed ?? 0,
    sentToShop: counters.sentToShop ?? 0,
    reservations: [],
  });
}

/** Plan A1, lot A1.4 : envoyer en boutique, c'est sortir de la réserve. */
describe("PackingStock.sendToShop — une sortie de réserve", () => {
  it("sort du libre, et le libre baisse d'autant", () => {
    const held = stock({ received: 12, packed: 4 });

    held.sendToShop(5, "Croissant");

    expect(held.sentToShop).toBe(5);
    expect(held.free).toBe(3);
    expect(held.toSnapshot()).toMatchObject({ sentToShop: 5, packed: 4, received: 12 });
  });

  it("envoie tout le libre, pas une pièce de plus", () => {
    const held = stock({ received: 12, returned: 2, packed: 4 });

    held.sendToShop(6, "Croissant");

    expect(held.free).toBe(0);
  });

  it("refuse au-delà du libre, en disant ce qui reste, sans rien sortir", () => {
    const held = stock({ received: 12, packed: 10 });

    expect(() => held.sendToShop(3, "Croissant")).toThrow(ReserveShortForShopError);
    expect(() => held.sendToShop(3, "Croissant")).toThrow(/Il ne reste que 2 « Croissant »/);
    expect(held.sentToShop).toBe(0);
  });

  it("ne prend jamais une pièce qu'un réassort lancé retient", () => {
    const held = stock({ received: 10 });
    held.reserve("rsp-1", 8, RESERVED_AT);

    expect(() => held.sendToShop(3, "Croissant")).toThrow(ReserveShortForShopError);
    held.sendToShop(2, "Croissant");
    expect(held.free).toBe(0);
  });

  it("ce qui est parti en boutique ne va plus au bac", () => {
    const held = stock({ received: 10, sentToShop: 8 });

    expect(() => held.take(3, "Croissant")).toThrow(LineNotProducedYetError);
    expect(held.giveBack(5)).toBe(2);
  });

  it.each([0, -1, 1.5])("refuse une quantité qui n'est pas un entier positif (%p)", (quantity) => {
    expect(() => stock({ received: 10 }).sendToShop(quantity, "Croissant")).toThrow(
      ReserveShopQuantityInvalidError,
    );
  });
});
