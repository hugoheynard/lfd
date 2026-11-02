import { EntryShortcutOffShelfError } from "../../errors/shelf-order-errors.js";
import { staffSupplyOf } from "../order-supply-rules.js";

/**
 * **La marque d'une saisie de l'équipe, et son raccourci** (plan du jour J,
 * §11.1, lot L6). « Aujourd'hui » est un paramètre, jamais lu à l'horloge.
 */
const TODAY = "2026-11-02";

describe("staffSupplyOf — ce que l'écran de l'équipe envoie", () => {
  it("fabriquée par défaut", () => {
    expect(staffSupplyOf(undefined, undefined, TODAY)).toEqual({ supply: "planned" });
    expect(staffSupplyOf("planned", undefined, TODAY)).toEqual({ supply: "planned" });
  });

  it("sur la vitrine, sans raccourci : une saisie « sur stock » ordinaire", () => {
    expect(staffSupplyOf("shelf", undefined, TODAY)).toEqual({
      supply: "shelf",
      today: TODAY,
      entryShortcut: null,
    });
  });

  it("le « Retrait immédiat » se garde sur la commande sur stock", () => {
    expect(staffSupplyOf("shelf", "immediate_pickup", TODAY)).toEqual({
      supply: "shelf",
      today: TODAY,
      entryShortcut: "immediate_pickup",
    });
  });

  it("refuse le raccourci sur une commande programmée, demandée ou par défaut", () => {
    expect(() => staffSupplyOf("planned", "immediate_pickup", TODAY)).toThrow(
      EntryShortcutOffShelfError,
    );
    expect(() => staffSupplyOf(undefined, "immediate_pickup", TODAY)).toThrow(
      EntryShortcutOffShelfError,
    );
  });
});
