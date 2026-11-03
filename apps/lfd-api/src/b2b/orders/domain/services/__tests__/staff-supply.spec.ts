import {
  CounterLinkSettlementRefusedError,
  EntryShortcutOffShelfError,
} from "../../errors/shelf-order-errors.js";
import { ensureCounterSettlement, isCounterEntry, staffSupplyOf } from "../order-supply-rules.js";

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

describe("ensureCounterSettlement — le comptoir ne règle qu'au compte (E4 étendu)", () => {
  it("le comptoir se lit sur l'origine OU sur le « Retrait immédiat »", () => {
    expect(isCounterEntry("counter", undefined)).toBe(true);
    expect(isCounterEntry(undefined, "immediate_pickup")).toBe(true);
    expect(isCounterEntry(undefined, undefined)).toBe(false);
  });

  it("refuse le lien au comptoir, l'admet ailleurs", () => {
    expect(() => ensureCounterSettlement("link", true)).toThrow(CounterLinkSettlementRefusedError);
    expect(() => ensureCounterSettlement("account", true)).not.toThrow();
    expect(() => ensureCounterSettlement("link", false)).not.toThrow();
  });
});
