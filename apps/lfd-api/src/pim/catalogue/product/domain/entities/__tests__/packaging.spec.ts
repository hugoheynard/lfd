import {
  InvalidPackagingQuantityError,
  InvalidVariantPricingError,
} from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Packaging } from "../packaging.js";

const open = (quantity = 20): Packaging =>
  Packaging.open({
    id: "pack_1",
    variantId: "var_1",
    sku: Sku.create("TAR-CIT-001-P-C20"),
    type: "carton",
    quantity,
  });

describe("Packaging", () => {
  it("naît emballé, mais ni pesé, ni tarifé, ni diffusé", () => {
    const snapshot = open().snapshot();
    expect(snapshot.quantity).toBe(20);
    // `null` dit « pas encore renseigné » — un 0 affirmerait « gratuit » et
    // « sans poids », deux choses fausses.
    expect(snapshot.grossWeightGrams).toBeNull();
    expect(snapshot.priceCents).toBeNull();
    expect(snapshot.channels).toEqual([]);
  });

  it("dérive son libellé de son type et de sa quantité", () => {
    // Le libellé n'est pas un champ : le stocker rouvrirait la porte à
    // « Carton 20 » et « carton de 20 » pour la même chose.
    expect(open().label).toBe("Carton de 20");
    const pack = open();
    pack.repack("plateau", 6);
    expect(pack.label).toBe("Plateau de 6");
  });

  it("refuse une quantité qui n'emballe rien", () => {
    expect(() => open(0)).toThrow(InvalidPackagingQuantityError);
    expect(() => open(-3)).toThrow(InvalidPackagingQuantityError);
    expect(() => open(2.5)).toThrow(InvalidPackagingQuantityError);
    // …et le refuse aussi APRÈS coup, pas seulement à l'ouverture.
    expect(() => open().repack("sac", 0)).toThrow(InvalidPackagingQuantityError);
  });

  it("n'est expédiable qu'une fois pesé", () => {
    const pack = open();
    expect(pack.isShippable).toBe(false);

    pack.describe({ grossWeightGrams: 4200, priceCents: 8900, channels: ["b2b"] });
    expect(pack.isShippable).toBe(true);
  });

  it("refuse un prix ou un poids qui n'a pas de sens", () => {
    const pack = open();
    expect(() => pack.describe({ grossWeightGrams: -1, priceCents: null, channels: [] })).toThrow(
      InvalidVariantPricingError,
    );
    expect(() => pack.describe({ grossWeightGrams: null, priceCents: 12.5, channels: [] })).toThrow(
      InvalidVariantPricingError,
    );
  });

  it("normalise ses canaux, pour qu'un ré-enregistrement ne se lise pas comme un changement", () => {
    const pack = open();
    pack.describe({
      grossWeightGrams: null,
      priceCents: null,
      channels: ["emporter", "b2b", "emporter"],
    });
    expect(pack.snapshot().channels).toEqual(["b2b", "emporter"]);
  });

  it("se reconstitue à l'identique", () => {
    const pack = open();
    pack.describe({ grossWeightGrams: 9800, priceCents: 21000, channels: ["b2b"] });
    const snapshot = pack.snapshot();
    expect(Packaging.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
