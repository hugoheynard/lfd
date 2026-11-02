import type { StockReservationSnapshot } from "../../domain/services/stock-reservations.js";
import { newlyLifted } from "../packing-stock-reservation.rows.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const RESERVED = new Date(0);
const LIFTED = new Date(60_000);

function reservation(resupplyId: string, releasedAt: Date | null): StockReservationSnapshot {
  return { resupplyId, quantity: 4, packed: 0, reservedAt: RESERVED, releasedAt };
}

/**
 * Régression (audit du réassort, 2026-11-02) : la réserve réécrivait chaque
 * levée déjà connue, une requête par réservation, à chaque geste.
 */
describe("newlyLifted — seules les levées nouvelles s'écrivent", () => {
  it("écarte une levée déjà lue, groupe les nouvelles par instant", () => {
    const known = new Map([
      ["r_old", reservation("r_old", LIFTED)],
      ["r_a", reservation("r_a", null)],
      ["r_b", reservation("r_b", null)],
    ]);
    const now = [
      reservation("r_old", LIFTED),
      reservation("r_a", LIFTED),
      reservation("r_b", LIFTED),
      reservation("r_open", null),
    ];

    expect(newlyLifted(now, known)).toEqual([{ at: LIFTED, resupplyIds: ["r_a", "r_b"] }]);
  });

  it("rien de levé depuis la lecture : aucune écriture", () => {
    const known = new Map([["r_old", reservation("r_old", LIFTED)]]);
    expect(newlyLifted([reservation("r_old", LIFTED)], known)).toEqual([]);
  });
});
