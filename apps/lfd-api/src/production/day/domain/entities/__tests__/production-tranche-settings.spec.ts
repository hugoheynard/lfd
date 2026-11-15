import { ProductionTrancheSettings } from "../production-tranche-settings.js";
import {
  DuplicateTrancheError,
  InvalidTrancheTimeError,
  TooManyTranchesError,
  UnknownTrancheModeError,
} from "../../errors/production-tranches-errors.js";

describe("ProductionTrancheSettings", () => {
  it("sans réglage : mode fixe, aucune heure", () => {
    const settings = ProductionTrancheSettings.defaults();

    expect(settings.mode).toBe("fixed");
    expect(settings.fixedTranches).toEqual([]);
  });

  it("trie les heures quel que soit l'ordre de saisie", () => {
    const settings = ProductionTrancheSettings.set("fixed", ["12:00", "05:00", "07:00"]);

    expect(settings.fixedTranches).toEqual(["05:00", "07:00", "12:00"]);
  });

  it("garde les heures fixes en mode calculé, pour le retour au fixe", () => {
    expect(ProductionTrancheSettings.set("computed", ["05:00"]).fixedTranches).toEqual(["05:00"]);
  });

  it.each(["5:00", "24:00", "07:60", "midi", ""])("refuse l'heure « %s »", (raw) => {
    expect(() => ProductionTrancheSettings.set("fixed", [raw])).toThrow(InvalidTrancheTimeError);
  });

  it("refuse la même heure deux fois, et la nomme", () => {
    expect(() => ProductionTrancheSettings.set("fixed", ["05:00", "07:00", "05:00"])).toThrow(
      /05:00 est saisie deux fois/u,
    );
    expect(() => ProductionTrancheSettings.set("fixed", ["05:00", "05:00"])).toThrow(
      DuplicateTrancheError,
    );
  });

  it("admet huit heures et refuse la neuvième", () => {
    const eight = ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00"];

    expect(ProductionTrancheSettings.set("fixed", eight).fixedTranches).toHaveLength(8);
    expect(() => ProductionTrancheSettings.set("fixed", [...eight, "09:00"])).toThrow(
      TooManyTranchesError,
    );
  });

  it("refuse un mode inconnu", () => {
    expect(() => ProductionTrancheSettings.set("vagues", [])).toThrow(UnknownTrancheModeError);
  });

  it("compare l'état, ordre de saisie compris", () => {
    const posed = ProductionTrancheSettings.set("fixed", ["07:00", "05:00"]);

    expect(posed.equals(ProductionTrancheSettings.set("fixed", ["05:00", "07:00"]))).toBe(true);
    expect(posed.equals(ProductionTrancheSettings.set("computed", ["05:00", "07:00"]))).toBe(false);
    expect(posed.equals(ProductionTrancheSettings.set("fixed", ["05:00"]))).toBe(false);
  });
});
