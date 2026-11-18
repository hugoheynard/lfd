import { DormantSheetWouldWakeError } from "../../errors/variant-lifecycle-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { VariantRegulatory } from "../variant-regulatory.js";
import { openedSnapshot } from "../variant-snapshot-mapper.js";
import type { VariantNutritionSnapshot, VariantSnapshot } from "../variant-snapshot.js";

const SKU = "CHO-001-2";

const VALUES: VariantNutritionSnapshot = {
  energyKcal: 480,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
};

function born(): VariantSnapshot {
  return openedSnapshot({
    id: "var_2",
    sku: Sku.create(SKU),
    name: { fr: "Sœur" },
    options: {},
    position: 1,
    customRecipe: false,
  });
}

describe("VariantRegulatory — la fiche réglementaire d'une déclinaison", () => {
  it("une née suit le défaut sur les deux moitiés et ne déclare rien", () => {
    const regulatory = VariantRegulatory.fromSnapshot(born());
    expect(regulatory).toMatchObject({ followsAllergens: true, followsNutrition: true });
    expect(regulatory.declaresOwnAllergens).toBe(false);
  });

  it("« aucun allergène » est une affirmation, pas un silence", () => {
    const declared = VariantRegulatory.fromSnapshot(born()).declareAllergens({
      allergens: [],
      mayContain: [],
    });
    expect(declared.declaresOwnAllergens).toBe(true);
  });

  it("enregistrer une moitié ne touche pas l'autre", () => {
    const withValues = VariantRegulatory.fromSnapshot(born()).declareNutritionValues(VALUES);
    expect(withValues.nutrition).toEqual(VALUES);
    expect(withValues.allergenSheet).toBeNull();
    const withSheet = withValues.declareAllergens({ allergens: ["gluten"], mayContain: [] });
    expect(withSheet.nutrition).toEqual(VALUES);
  });

  it("s'aligner puis se désaligner rend ce qu'on avait écrit", () => {
    const own = VariantRegulatory.fromSnapshot(born()).declareNutritionValues(VALUES);
    const roundTrip = own.align("nutrition", true).align("nutrition", false);
    expect(roundTrip.nutrition).toEqual(VALUES);
    expect(roundTrip.followsNutrition).toBe(false);
    expect(roundTrip.followsAllergens).toBe(true);
  });

  it("devient le défaut : chaque moitié suivie passe en propre avec ce qu'elle voyait", () => {
    const seen = { ...born(), nutrition: VALUES };
    const promoted = VariantRegulatory.fromSnapshot(born()).promote(SKU, seen);
    expect(promoted).toMatchObject({ followsAllergens: false, followsNutrition: false });
    expect(promoted.nutrition).toEqual(VALUES);
  });

  it("refuse de réveiller une saisie ancienne que le défaut n'a jamais déclarée", () => {
    const dormant = VariantRegulatory.fromSnapshot(born()).declareNutritionValues(VALUES);
    expect(() => dormant.promote(SKU, { ...born(), nutrition: null })).toThrow(
      DormantSheetWouldWakeError,
    );
  });
});
