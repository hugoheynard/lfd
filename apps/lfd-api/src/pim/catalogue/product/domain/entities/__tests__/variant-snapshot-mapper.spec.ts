import { Sku } from "../../value-objects/sku.value-object.js";
import { followsDefaultIn } from "../variant-aspect.js";
import {
  defaultSnapshotFrom,
  openedDefaultSnapshot,
  openedSnapshot,
} from "../variant-snapshot-mapper.js";

const SKU = Sku.create("CHO-001-1");

describe("VariantSnapshotMapper — l'état de naissance d'une déclinaison", () => {
  it("le défaut naît en tête, hors tarif, et ne se suit pas lui-même", () => {
    expect(openedDefaultSnapshot({ id: "var_1", sku: SKU, name: { fr: "Boîte" } })).toMatchObject({
      isDefault: true,
      position: 0,
      priceCents: null,
      saleUnit: "piece",
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: false,
      pricingFollowsDefault: false,
      allergenSheet: null,
    });
  });

  it("une déclinaison de plus naît alignée sur la fiche, mais pas sur le tarif", () => {
    const snapshot = openedSnapshot({
      id: "var_2",
      sku: Sku.create("CHO-001-2"),
      name: { fr: "Sœur" },
      options: { taille: "L" },
      position: 3,
      customRecipe: true,
    });
    expect(snapshot).toMatchObject({
      isDefault: false,
      position: 3,
      customRecipe: true,
      options: { taille: "L" },
      regulatoryFollowsDefault: true,
      nutritionFollowsDefault: true,
      pricingFollowsDefault: false,
      minQuantityFollowsDefault: false,
    });
  });

  it("le défaut né d'un détachement garde ce que la déclinaison voyait et ne suit plus rien", () => {
    const resolved = {
      ...openedSnapshot({
        id: "var_2",
        sku: Sku.create("CHO-001-2"),
        name: { fr: "Sœur" },
        options: {},
        position: 2,
        customRecipe: false,
      }),
      priceCents: 1200,
      hasBeenPublished: true,
    };
    const born = defaultSnapshotFrom(resolved, { id: "var_9", sku: SKU, name: { fr: "Neuf" } });
    expect(born).toMatchObject({
      id: "var_9",
      isDefault: true,
      position: 0,
      priceCents: 1200,
      detachedFromVariantId: "var_2",
      detachedToProductId: null,
      hasBeenPublished: false,
      regulatoryFollowsDefault: false,
    });
  });
});

describe("followsDefaultIn — le seul endroit où « regulatory » et « allergens » se rejoignent", () => {
  it("lit le drapeau des allergènes pour les deux mots", () => {
    const snapshot = {
      ...openedDefaultSnapshot({ id: "var_1", sku: SKU, name: { fr: "Boîte" } }),
      regulatoryFollowsDefault: true,
    };
    expect(followsDefaultIn(snapshot, "regulatory")).toBe(true);
    expect(followsDefaultIn(snapshot, "allergens")).toBe(true);
    expect(followsDefaultIn(snapshot, "pricing")).toBe(false);
    expect(followsDefaultIn(snapshot, "nutrition")).toBe(false);
  });
});
