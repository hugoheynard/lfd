import { ALLERGEN_MAPPINGS } from "../../../allergen-mapping.js";
import {
  AllergenCategoryKeyInvalidError,
  AllergenCodeInvalidError,
  AllergenLabelRequiredError,
  UnknownIncoCategoryError,
} from "../../errors/allergen-errors.js";
import { AllergenCategoryKey } from "../allergen-category-key.js";
import { AllergenCode } from "../allergen-code.js";
import { cleanLabel } from "../allergen-label.js";
import { INCO_CATEGORIES, toIncoCategory } from "../inco-category.js";

/** Les clés semées par la migration : les 14 de l'annexe II, plus « hors UE ». */
const SEEDED_CATEGORY_KEYS = [...INCO_CATEGORIES, "non_eu"];

describe("AllergenCode", () => {
  // Le référentiel semé est relu par `reconstitute()`, qui repasse par le VO :
  // une forme qui refuserait un seul des 30 codes casserait la lecture en prod.
  it("accepte les 30 codes officiels du référentiel", () => {
    for (const mapping of ALLERGEN_MAPPINGS) {
      expect(AllergenCode.create(mapping.gs1Code).value).toBe(mapping.gs1Code);
    }
    expect(ALLERGEN_MAPPINGS).toHaveLength(30);
  });

  it("nettoie avant de figer, et c'est la version nettoyée qui sort", () => {
    expect(AllergenCode.create("  SH  ").value).toBe("SH");
  });

  // Remonter `sh` en `SH` ferait entrer deux graphies du même code dans les
  // déclarations stockées, dont une que le référentiel ne reconnaîtrait pas.
  it("refuse une casse basse plutôt que de la normaliser", () => {
    expect(() => AllergenCode.create("sh")).toThrow(AllergenCodeInvalidError);
  });

  it.each([
    ["", "vide"],
    ["S H", "avec une espace"],
    ["S-", "mal séparé"],
    ["Blé", "un libellé"],
  ])("refuse le code « %s » (%s)", (raw) => {
    expect(() => AllergenCode.create(raw)).toThrow(AllergenCodeInvalidError);
  });

  it("laisse un code maison prendre une forme lisible", () => {
    expect(AllergenCode.create("MAISON_SESAME_TORREFIE").value).toBe("MAISON_SESAME_TORREFIE");
  });

  it("compare par la valeur", () => {
    expect(AllergenCode.create("SH").equals(AllergenCode.create(" SH "))).toBe(true);
    expect(AllergenCode.create("SH").equals(AllergenCode.create("SA"))).toBe(false);
  });

  // Au-delà de 24, « ce n'est plus un code : c'est une phrase rangée dans une
  // colonne » (commentaire du VO) — la frontière elle-même, pas une valeur
  // arbitraire en deçà.
  it("accepte un code de 24 caractères et refuse le 25e", () => {
    const atLimit = "A".repeat(24);
    const overLimit = "A".repeat(25);

    expect(AllergenCode.create(atLimit).value).toBe(atLimit);
    expect(() => AllergenCode.create(overLimit)).toThrow(AllergenCodeInvalidError);
  });
});

describe("AllergenCategoryKey", () => {
  // Les clés officielles portent des soulignés (`tree_nuts`, `non_eu`) et sont
  // inaltérables : une forme qui n'accepterait que le tiret — celle du contexte
  // voisin — ferait échouer la relecture des lignes semées.
  it("accepte les 15 clés officielles, soulignés compris", () => {
    for (const key of SEEDED_CATEGORY_KEYS) {
      expect(AllergenCategoryKey.create(key).value).toBe(key);
    }
    expect(SEEDED_CATEGORY_KEYS).toHaveLength(15);
  });

  it("accepte une clé maison en tirets", () => {
    expect(AllergenCategoryKey.create("fruits-coque-exotiques").value).toBe(
      "fruits-coque-exotiques",
    );
  });

  it.each([["Tree_Nuts"], ["fruits à coque"], ["_gluten"], [""]])(
    "refuse une clé %p qui n'est pas une identité",
    (raw) => {
      expect(() => AllergenCategoryKey.create(raw)).toThrow(AllergenCategoryKeyInvalidError);
    },
  );

  // Même frontière que le code, à sa propre borne : au-delà de 48, « une clé
  // plus longue est un libellé déguisé » (commentaire du VO).
  it("accepte une clé de 48 caractères et refuse la 49e", () => {
    const atLimit = "a".repeat(48);
    const overLimit = "a".repeat(49);

    expect(AllergenCategoryKey.create(atLimit).value).toBe(atLimit);
    expect(() => AllergenCategoryKey.create(overLimit)).toThrow(AllergenCategoryKeyInvalidError);
  });
});

describe("cleanLabel", () => {
  it("rogne les espaces et garde les traductions remplies", () => {
    expect(cleanLabel("l'allergène", { fr: "  Noisettes ", en: "Hazelnuts" })).toEqual({
      fr: "Noisettes",
      en: "Hazelnuts",
    });
  });

  // Une locale vide comptée comme traduction ferait croire l'étiquette traduite.
  it("retire une locale vidée plutôt que de garder une chaîne vide", () => {
    expect(cleanLabel("l'allergène", { fr: "Noisettes", en: "   " })).toEqual({
      fr: "Noisettes",
    });
  });

  it("refuse un libellé sans langue source", () => {
    expect(() => cleanLabel("l'allergène", { fr: "  " })).toThrow(AllergenLabelRequiredError);
  });
});

describe("toIncoCategory", () => {
  it("reconnaît les 14 catégories de l'annexe II", () => {
    for (const category of INCO_CATEGORIES) {
      expect(toIncoCategory(category)).toBe(category);
    }
    expect(INCO_CATEGORIES).toHaveLength(14);
  });

  // `null` dit « hors annexe II » — catégorie maison OU « hors obligation UE ».
  // C'est `official` qui dit autre chose, et les deux ne se confondent pas.
  it("laisse passer l'absence de catégorie", () => {
    expect(toIncoCategory(null)).toBeNull();
  });

  it("refuse une valeur que l'annexe II ne connaît pas", () => {
    expect(() => toIncoCategory("non_eu")).toThrow(UnknownIncoCategoryError);
  });

  // La liste énumérable et l'union du code sont deux écritures de la même
  // chose : elles ne peuvent diverger qu'ici, et c'est ce test qui le voit.
  it("énumère exactement les catégories que le référentiel rattache", () => {
    const used = new Set(
      ALLERGEN_MAPPINGS.map((mapping) => mapping.incoCategory).filter(
        (category) => category !== null,
      ),
    );

    expect([...used].sort()).toEqual([...INCO_CATEGORIES].sort());
  });
});
