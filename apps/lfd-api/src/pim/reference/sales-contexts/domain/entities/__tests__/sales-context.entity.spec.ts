import {
  RootSalesContextProtectedError,
  SalesContextInUseError,
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
        archivedAt: null,
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
      const snapshot = {
        id: "x",
        key: "b2b",
        label: "Pro",
        active: false,
        position: 0,
        archivedAt: null,
      };

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

  describe("archive", () => {
    /** L'instant n'est comparé qu'à lui-même : aucune horloge n'est en jeu. */
    const AT = new Date("2026-11-18T09:00:00.000Z");

    it("refuse d'archiver la racine, en disant qu'elle peut être mise hors service", () => {
      const root = open(ROOT_CONTEXT_KEY, "Pro");

      expect(root.isRoot).toBe(true);
      expect(() => root.archive(AT, 0)).toThrow(RootSalesContextProtectedError);
      expect(() => root.archive(AT, 0)).toThrow(/hors service/u);
    });

    it("refuse d'archiver un contexte qui porte des taux", () => {
      const context = open("traiteur");

      expect(() => context.archive(AT, 2)).toThrow(SalesContextInUseError);
      expect(context.isArchived).toBe(false);
    });

    it("archive un contexte ordinaire que rien ne retient, une seule fois", () => {
      const context = open("traiteur");

      expect(context.archive(AT, 0)).toBe(true);
      expect(context.archive(AT, 0)).toBe(false);
      expect(context.snapshot().archivedAt).toBe(AT);
    });

    it("se restaure, et la restauration rejouée ne change rien", () => {
      const context = open("traiteur");
      context.archive(AT, 0);

      expect(context.restore()).toBe(true);
      expect(context.restore()).toBe(false);
      expect(context.isArchived).toBe(false);
    });
  });
});
