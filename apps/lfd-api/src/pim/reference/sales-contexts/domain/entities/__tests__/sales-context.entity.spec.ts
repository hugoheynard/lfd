import {
  RootSalesContextProtectedError,
  SalesContextKeyInvalidError,
  SalesContextLabelRequiredError,
} from "../../errors/sales-context-errors.js";
import { ROOT_CONTEXT_KEY } from "../../value-objects/bootstrap-contexts.js";
import { SalesContextAggregate } from "../sales-context.entity.js";

function open(key: string, label = "Traiteur"): SalesContextAggregate {
  return SalesContextAggregate.open({ id: `ctx_${key}`, key, label, active: true, position: 3 });
}

describe("SalesContextAggregate", () => {
  describe("open", () => {
    it("pose un contexte avec la clé et le libellé nettoyés", () => {
      const context = open("  traiteur ", "  Traiteur  ");

      expect(context.snapshot()).toEqual({
        id: "ctx_  traiteur ",
        key: "traiteur",
        label: "Traiteur",
        active: true,
        position: 3,
      });
    });

    it("accepte lettres, chiffres et tirets après une première lettre minuscule", () => {
      expect(open("eatIn-2").key).toBe("eatIn-2");
    });

    it("refuse une clé vide, majuscule initiale, chiffre initial, espace ou tiret bas", () => {
      for (const bad of ["", "   ", "Traiteur", "1traiteur", "sur place", "sur_place", "-a"]) {
        expect(() => open(bad)).toThrow(SalesContextKeyInvalidError);
      }
    });

    it("refuse un libellé vide ou blanc", () => {
      expect(() => open("traiteur", "   ")).toThrow(SalesContextLabelRequiredError);
    });
  });

  describe("reconstitute", () => {
    it("rend l'instantané tel qu'il a été relu, sans revalider la clé", () => {
      const snapshot = { id: "x", key: "b2b", label: "Pro", active: false, position: 0 };

      expect(SalesContextAggregate.reconstitute(snapshot).snapshot()).toEqual(snapshot);
    });
  });

  describe("revise", () => {
    it("remplace libellé, état de service et rang, jamais la clé", () => {
      const context = open("traiteur");

      context.revise({ label: " Traiteur & cie ", active: false, position: 9 });

      expect(context.snapshot()).toMatchObject({
        key: "traiteur",
        label: "Traiteur & cie",
        active: false,
        position: 9,
      });
    });

    it("refuse un libellé vide et laisse le contexte intact", () => {
      const context = open("traiteur");

      expect(() => context.revise({ label: "", active: false, position: 9 })).toThrow(
        SalesContextLabelRequiredError,
      );
      expect(context.snapshot()).toMatchObject({ label: "Traiteur", active: true, position: 3 });
    });

    it("laisse la racine se régler et se mettre hors service", () => {
      const root = open(ROOT_CONTEXT_KEY, "Pro");

      root.revise({ label: "Vente en ligne", active: false, position: 0 });

      expect(root.snapshot()).toMatchObject({ label: "Vente en ligne", active: false });
    });
  });

  describe("refuseRemovalIfRoot", () => {
    it("refuse d'effacer la racine, en disant qu'elle peut être mise hors service", () => {
      const root = open(ROOT_CONTEXT_KEY, "Pro");

      expect(root.isRoot).toBe(true);
      expect(() => root.refuseRemovalIfRoot()).toThrow(RootSalesContextProtectedError);
      expect(() => root.refuseRemovalIfRoot()).toThrow(/hors service/u);
    });

    it("laisse passer un contexte ordinaire", () => {
      const context = open("traiteur");

      expect(context.isRoot).toBe(false);
      expect(() => context.refuseRemovalIfRoot()).not.toThrow();
    });
  });
});
