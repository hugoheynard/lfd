import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";
import { productFieldsFrom, productSnapshot } from "../product-snapshot-mapper.js";
import { resolveVariant } from "../variant-resolution.js";
import { Variant } from "../variant.js";

function aProduct(): Product {
  return Product.open({
    id: "prd_1",
    sku: Sku.create("CHO-001"),
    name: { fr: "Gros florentin", en: "Big florentine" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: {
      id: "var_1",
      sku: Sku.create("CHO-001-1"),
      name: { fr: "Boîte de 220 g" },
    },
  });
}

describe("ProductSnapshotMapper — la forme de l'instantané ne bouge pas", () => {
  it("relit les champs d'un instantané et le rend à l'identique", () => {
    const snapshot = aProduct().persistenceSnapshot();
    expect(productSnapshot(productFieldsFrom(snapshot), snapshot.variants)).toEqual(snapshot);
  });

  it("le champ facultatif à la lecture reprend la valeur de toute fiche", () => {
    const { originVariantId: _origin, ...legacy } = aProduct().persistenceSnapshot();
    const fields = productFieldsFrom(legacy);
    expect(fields.originVariantId).toBeNull();
  });

  it("garde l'ordre des clés — l'empreinte de révision en dépend", () => {
    expect(Object.keys(aProduct().snapshot())).toEqual([
      "id",
      "sku",
      "name",
      "slug",
      "kind",
      "categoryId",
      "status",
      "vatByContext",
      "operationOnly",
      "requiresCold",
      "audience",
      "originVariantId",
      "variants",
    ]);
  });

  it("persiste le NON résolu : une alignée garde ce qu'elle porte, le défaut ne s'y recopie pas", () => {
    const product = aProduct();
    const added = product.addVariant({
      id: "var_2",
      sku: Sku.create("CHO-001-2"),
      name: { fr: "Boîte de 440 g" },
      options: {},
    });
    product.priceVariant("var_1", { priceCents: 1200, weightGrams: 220 });
    product.alignVariant(added.id, "pricing", true);
    expect(product.persistenceSnapshot().variants[1]?.priceCents).toBeNull();
    expect(product.snapshot().variants[1]?.priceCents).toBe(1200);
  });
});

describe("resolveVariant — ce que le défaut prête à une déclinaison alignée", () => {
  it("une déclinaison qui ne suit rien se rend telle qu'elle est", () => {
    const own = Variant.openDefault({
      id: "var_1",
      sku: Sku.create("CHO-001-1"),
      name: { fr: "Boîte" },
    });
    expect(resolveVariant(own, own)).toEqual(own.snapshot());
  });
});
