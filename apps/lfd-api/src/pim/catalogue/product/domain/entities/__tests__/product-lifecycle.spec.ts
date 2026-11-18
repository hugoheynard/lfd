import {
  ArchivedProductNotPublishableError,
  ArchivedProductNotWithdrawableError,
  DeletedProductNotChangeableError,
  NotArchivedProductNotDeletableError,
  NotArchivedProductNotRestorableError,
} from "../../errors/product-errors.js";
import {
  statusAfterActivation,
  statusAfterArchiving,
  statusAfterDeactivation,
  statusAfterDeletion,
  statusAfterRestoration,
} from "../product-lifecycle.js";
import type { ProductStatus } from "../product-state.js";

const COMPLETE = () => [];
const INCOMPLETE = () => [{ code: "all_variants_discontinued", severity: "blocking" } as const];

describe("product-lifecycle — les transitions de statut d'une fiche", () => {
  describe("mise en vente", () => {
    it("un brouillon complet part en ligne", () => {
      expect(statusAfterActivation("prd_1", "draft", COMPLETE)).toBe("published");
    });

    it("une fiche déjà en ligne y reste, sans même rejuger", () => {
      let judgments = 0;
      const judge = () => {
        judgments += 1;
        return [];
      };
      expect(statusAfterActivation("prd_1", "published", judge)).toBe("published");
      expect(judgments).toBe(0);
    });

    it("refuse un brouillon incomplet, une archivée et une supprimée", () => {
      expect(() => statusAfterActivation("prd_1", "draft", INCOMPLETE)).toThrow();
      expect(() => statusAfterActivation("prd_1", "archived", COMPLETE)).toThrow(
        ArchivedProductNotPublishableError,
      );
      expect(() => statusAfterActivation("prd_1", "deleted", COMPLETE)).toThrow(
        DeletedProductNotChangeableError,
      );
    });
  });

  it("retire de la vente : une en ligne redevient brouillon, une archivée refuse", () => {
    expect(statusAfterDeactivation("prd_1", "published")).toBe("draft");
    expect(statusAfterDeactivation("prd_1", "draft")).toBe("draft");
    expect(() => statusAfterDeactivation("prd_1", "archived")).toThrow(
      ArchivedProductNotWithdrawableError,
    );
  });

  it("archive tout sauf une supprimée, et déjà archivée n'est pas une erreur", () => {
    for (const status of ["draft", "published", "archived"] as const) {
      expect(statusAfterArchiving("prd_1", status)).toBe("archived");
    }
    expect(() => statusAfterArchiving("prd_1", "deleted")).toThrow(
      DeletedProductNotChangeableError,
    );
  });

  it("ne restaure qu'une archivée, en brouillon — jamais en ligne", () => {
    expect(statusAfterRestoration("prd_1", "archived")).toBe("draft");
    for (const status of ["draft", "published", "deleted"] as const satisfies ProductStatus[]) {
      expect(() => statusAfterRestoration("prd_1", status)).toThrow(
        NotArchivedProductNotRestorableError,
      );
    }
  });

  it("ne supprime qu'une archivée", () => {
    expect(statusAfterDeletion("prd_1", "archived")).toBe("deleted");
    for (const status of ["draft", "published", "deleted"] as const) {
      expect(() => statusAfterDeletion("prd_1", status)).toThrow(
        NotArchivedProductNotDeletableError,
      );
    }
  });
});
