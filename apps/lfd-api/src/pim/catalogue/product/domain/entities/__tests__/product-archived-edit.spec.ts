import { ArchivedProductNotEditableError } from "../../errors/archived-product-edit-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product, type ProductStatus } from "../product.js";

/**
 * **Une fiche archivée ne se modifie pas** : renommer, changer de type ou de
 * famille se refuse tant qu'elle n'est pas restaurée (décidé par Hugo le
 * 2026-11-18).
 */
const withStatus = (status: ProductStatus): Product =>
  Product.reconstitute({
    ...Product.open({
      id: "prod_1",
      sku: Sku.create("PATI-TARTE"),
      name: { fr: "Tarte aux fraises" },
      kind: "daily",
      categoryId: "cat_1",
      defaultVariant: { id: "var_1", sku: Sku.create("PATI-TARTE-1"), name: { fr: "6 parts" } },
    }).snapshot(),
    status,
  });

const GESTURES = {
  rename: (product: Product) => product.rename({ fr: "Tarte aux framboises" }),
  change_kind: (product: Product) => product.changeKind("made_to_order"),
  reclassify: (product: Product) => product.reclassify("cat_2"),
} as const;

describe("une fiche archivée refuse les gestes d'identité", () => {
  it.each(Object.entries(GESTURES))("%s est refusé, la fiche reste inchangée", (gesture, act) => {
    const product = withStatus("archived");
    const before = product.snapshot();
    let refusal: unknown = null;
    try {
      act(product);
    } catch (caught) {
      refusal = caught;
    }
    expect(refusal).toBeInstanceOf(ArchivedProductNotEditableError);
    expect(refusal).toMatchObject({ gesture });
    expect(product.snapshot()).toEqual(before);
  });

  it.each(["draft", "published"] as const)("une fiche %s les accepte", (status) => {
    const product = withStatus(status);
    for (const act of Object.values(GESTURES)) {
      act(product);
    }
    expect(product.snapshot()).toMatchObject({
      name: { fr: "Tarte aux framboises" },
      kind: "made_to_order",
      categoryId: "cat_2",
    });
  });

  it("le message nomme le geste de sortie", () => {
    expect(() => GESTURES.rename(withStatus("archived"))).toThrow(/Restaurez-le d'abord/);
  });
});
