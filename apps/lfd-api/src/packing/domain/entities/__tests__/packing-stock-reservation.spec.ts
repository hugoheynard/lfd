import { LineNotProducedYetError } from "../../errors/packing-station-errors.js";
import { StockReservationQuantityInvalidError } from "../../errors/packing-resupply-errors.js";
import { PackingStock } from "../packing-stock.js";

/** Instants comparés entre eux seulement, jamais à l'horloge — exception étroite du §5. */
const FIRST = new Date("2026-10-22T07:00:00.000Z");
const SECOND = new Date("2026-10-22T07:05:00.000Z");
const CLOSED = new Date("2026-10-22T08:00:00.000Z");

function stock(received: number, packed = 0, returned = 0): PackingStock {
  return PackingStock.fromSnapshot({
    serviceDay: "2026-10-22",
    sku: "CRO",
    received,
    returned,
    packed,
    sentToShop: 0,
    reservations: [],
  });
}

/** Ce que le four remet ensuite : le reçu n'avance que par la remise. */
function afterHandoff(held: PackingStock, pieces: number): PackingStock {
  const snapshot = held.toSnapshot();
  return PackingStock.fromSnapshot({ ...snapshot, received: snapshot.received + pieces });
}

describe("PackingStock — la réserve d'un réassort lancé (R4b, Q7)", () => {
  it("retire les pièces réservées du libre : une commande ne les prend pas", () => {
    const held = stock(20);
    expect(held.reserve("rs_asap", 12, FIRST)).toBe(true);

    expect(held.free).toBe(8);
    expect(() => held.take(9, "Croissant")).toThrow(/Il manque 1 « Croissant »/);
    expect(held.packed).toBe(0);
  });

  it("ne prend JAMAIS une pièce déjà au bac : elle attend le four", () => {
    const held = stock(10, 10);
    held.reserve("rs_asap", 6, FIRST);

    expect(held.packed).toBe(10);
    expect(held.free).toBe(0);
    expect(held.awaitingOven("rs_asap")).toBe(6);
  });

  it("les remises suivantes servent la réserve avant les commandes", () => {
    const held = stock(10, 10);
    held.reserve("rs_asap", 6, FIRST);

    const partly = afterHandoff(held, 4);
    expect(partly.awaitingOven("rs_asap")).toBe(2);
    expect(partly.free).toBe(0);

    const served = afterHandoff(partly, 4);
    expect(served.awaitingOven("rs_asap")).toBe(0);
    expect(served.free).toBe(2);
  });

  it("la fiche emballe sur sa réservation même quand le libre est à zéro", () => {
    const held = stock(12);
    held.reserve("rs_asap", 12, FIRST);
    expect(held.free).toBe(0);

    held.takeForResupply("rs_asap", 12, "Croissant");

    expect(held.packed).toBe(12);
    expect(held.reserved).toBe(0);
    expect(held.free).toBe(0);
  });

  it("baisser la saisie rend les pièces à la réservation, pas au libre", () => {
    const held = stock(12);
    held.reserve("rs_asap", 12, FIRST);
    held.takeForResupply("rs_asap", 12, "Croissant");

    held.releaseFromResupply("rs_asap", 5);

    expect(held.reserved).toBe(5);
    expect(held.free).toBe(0);
  });

  it("une fiche du soir n'a que le libre : elle ne prend pas une pièce réservée", () => {
    const held = stock(12);
    held.reserve("rs_asap", 10, FIRST);

    expect(() => held.takeForResupply("rs_evening", 3, "Croissant")).toThrow(
      LineNotProducedYetError,
    );
    held.takeForResupply("rs_evening", 2, "Croissant");
    expect(held.reserved).toBe(10);
  });

  it("deux lancés se partagent une remise courte dans l'ordre du lancement", () => {
    const held = stock(8);
    held.reserve("rs_b", 6, SECOND);
    held.reserve("rs_a", 6, FIRST);

    expect(held.awaitingOven("rs_a")).toBe(0);
    expect(held.awaitingOven("rs_b")).toBe(4);
    expect(() => held.takeForResupply("rs_b", 3, "Croissant")).toThrow(/Il manque 1/);
    held.takeForResupply("rs_b", 2, "Croissant");
    held.takeForResupply("rs_a", 6, "Croissant");
    expect(held.packed).toBe(8);
  });

  it("la levée à la clôture rend libre ce qui n'a pas été emballé", () => {
    const held = stock(12);
    held.reserve("rs_asap", 12, FIRST);
    held.takeForResupply("rs_asap", 9, "Croissant");

    expect(held.lift("rs_asap", CLOSED)).toBe(true);

    expect(held.free).toBe(3);
    expect(held.lift("rs_asap", CLOSED)).toBe(false);
  });

  it("un rejeu ne réserve pas deux fois, même après la levée", () => {
    const held = stock(12);
    held.reserve("rs_asap", 6, FIRST);
    held.lift("rs_asap", CLOSED);

    expect(held.reserve("rs_asap", 6, SECOND)).toBe(false);
    expect(held.free).toBe(12);
  });

  it("le fournil ne reprend pas en retour une pièce réservée", () => {
    const held = stock(12);
    held.reserve("rs_asap", 8, FIRST);

    expect(held.giveBack(12)).toBe(4);
  });

  it.each([0, -1, 2.5])("refuse une réservation de %p pièce(s)", (quantity) => {
    expect(() => stock(12).reserve("rs_asap", quantity, FIRST)).toThrow(
      StockReservationQuantityInvalidError,
    );
  });
});
