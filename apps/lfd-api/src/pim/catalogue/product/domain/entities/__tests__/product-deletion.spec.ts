import {
  DeletedProductNotChangeableError,
  NotArchivedProductNotDeletableError,
  NotArchivedProductNotRestorableError,
} from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { isLiveStatus, Product, type ProductStatus } from "../product.js";

/**
 * **Supprimer une fiche archivée** — un soft delete
 * (`documentation/pim/plan-effacer-une-fiche-archivee.md`, v4, points 2 et 7).
 * Un seul garde-fou : la fiche est archivée. Une supprimée ne redevient rien.
 */
const open = (): Product =>
  Product.open({
    id: "prod_1",
    sku: Sku.create("PATI-TARTE"),
    name: { fr: "Tarte aux fraises" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("PATI-TARTE-1"), name: { fr: "6 parts" } },
  });

/** Une fiche rendue telle que la base la relit, au statut voulu. */
const withStatus = (status: ProductStatus): Product =>
  Product.reconstitute({ ...open().snapshot(), status });

const deleted = (): Product => {
  const product = withStatus("archived");
  product.delete();
  return product;
};

describe("supprimer une fiche", () => {
  it("passe une archivée à `deleted` — la fiche reste, son SKU aussi", () => {
    const product = deleted();
    expect(product.status).toBe("deleted");
    expect(product.snapshot().sku).toBe("PATI-TARTE");
  });

  it.each<ProductStatus>(["draft", "published"])(
    "refuse une fiche « %s » en nommant son statut réel",
    (status) => {
      const product = withStatus(status);
      const refusal = (): void => {
        product.delete();
      };
      expect(refusal).toThrow(NotArchivedProductNotDeletableError);
      expect(refusal).toThrow(status === "draft" ? /en brouillon/ : /en ligne/);
      expect(product.status).toBe(status);
    },
  );

  it("refuse une fiche déjà supprimée : il n'y a pas de « déjà fait » à taire", () => {
    const product = deleted();
    expect(() => {
      product.delete();
    }).toThrow(/déjà supprimée/);
  });

  it("ne se restaure pas : elle n'est pas archivée", () => {
    const product = deleted();
    expect(() => product.restore()).toThrow(NotArchivedProductNotRestorableError);
    expect(product.status).toBe("deleted");
  });

  it("ne s'archive plus — une supprimée ne redevient rien par l'écran", () => {
    const product = deleted();
    expect(() => product.archive()).toThrow(DeletedProductNotChangeableError);
    expect(product.status).toBe("deleted");
  });

  /**
   * `activate` ne regardait que `archived` : une supprimée, ni archivée ni en
   * ligne, serait passée au jugement de complétude — et en vente.
   */
  it("ne se publie pas", () => {
    const product = deleted();
    expect(() => product.activate({}, { activeContextKeys: [] }, [], "both")).toThrow(
      DeletedProductNotChangeableError,
    );
    expect(product.status).toBe("deleted");
  });
});

describe("isLiveStatus", () => {
  it.each<[ProductStatus, boolean]>([
    ["draft", true],
    ["published", true],
    ["archived", false],
    ["deleted", false],
  ])("« %s » vivante : %s", (status, live) => {
    expect(isLiveStatus(status)).toBe(live);
  });
});
