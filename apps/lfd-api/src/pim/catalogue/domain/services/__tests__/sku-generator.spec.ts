import { SkuGenerationExhaustedError } from "../../errors/sku-errors.js";
import { Sku, SKU_MAX_LENGTH } from "../../value-objects/sku.value-object.js";
import {
  familyPrefix,
  optionsDiscriminator,
  productMnemonic,
  productSkuRoot,
  proposeSku,
  variantSkuRoot,
  type SkuAvailability,
} from "../sku-generator.js";

/** Port en dur : le domaine se teste sans base ni framework. */
function availabilityOf(taken: readonly string[]): SkuAvailability {
  const set = new Set(taken);
  return {
    isTaken: (candidate: Sku): Promise<boolean> => Promise.resolve(set.has(candidate.value)),
  };
}

describe("génération de la référence par défaut", () => {
  describe("familyPrefix", () => {
    it.each([
      ["viennoiseries", "VIEN"],
      ["patisserie", "PATI"],
      ["pain-de-mie", "PAIN"],
    ])("%s → %s", (slug, expected) => {
      expect(familyPrefix(slug)).toBe(expected);
    });
  });

  describe("productMnemonic", () => {
    it("retire les mots vides et tronque", () => {
      expect(productMnemonic("Tarte aux fraises")).toBe("TARTE-FRAISE");
    });

    it("garde au plus deux mots", () => {
      expect(productMnemonic("Pain de campagne au levain")).toBe("PAIN-CAMPAG");
    });

    it("survit à un nom entièrement composé de mots vides", () => {
      expect(productMnemonic("de la")).toBe("");
    });
  });

  describe("optionsDiscriminator", () => {
    it("garde les nombres entiers et réduit les mots", () => {
      expect(optionsDiscriminator(new Map([["taille", "6 pers"]]))).toBe("6P");
    });

    it("garde un mot seul plus long, sinon il serait illisible", () => {
      expect(optionsDiscriminator(new Map([["parfum", "chocolat"]]))).toBe("CHOC");
    });

    it("combine plusieurs options", () => {
      const options = new Map([
        ["taille", "6 pers"],
        ["parfum", "chocolat"],
      ]);
      expect(optionsDiscriminator(options)).toBe("6P-CHOC");
    });

    it("est vide quand il n’y a pas d’option", () => {
      expect(optionsDiscriminator(new Map())).toBe("");
    });
  });

  describe("racines", () => {
    it("compose famille + produit", () => {
      expect(productSkuRoot("patisserie", "Tarte aux fraises")).toBe("PATI-TARTE-FRAISE");
    });

    it("préfixe la déclinaison par la référence du produit", () => {
      const product = Sku.create("PATI-TARTE-FRAISE");
      const options = new Map([["taille", "6 pers"]]);
      expect(variantSkuRoot(product, options, 0)).toBe("PATI-TARTE-FRAISE-6P");
    });

    // Sans suffixe, la déclinaison par défaut viserait la référence du produit
    // lui-même — or l'espace de noms est global. On retombe sur le rang.
    it("retombe sur le rang quand aucune option ne distingue", () => {
      const product = Sku.create("VIEN-CROISS");
      expect(variantSkuRoot(product, new Map(), 0)).toBe("VIEN-CROISS-1");
      expect(variantSkuRoot(product, new Map(), 1)).toBe("VIEN-CROISS-2");
    });
  });

  describe("proposeSku", () => {
    it("rend la racine telle quelle quand elle est libre", async () => {
      const sku = await proposeSku("PATI-TARTE-FRAISE", availabilityOf([]));
      expect(sku.value).toBe("PATI-TARTE-FRAISE");
    });

    it("suffixe de façon lisible en cas de collision", async () => {
      const taken = availabilityOf(["PATI-TARTE-FRAISE", "PATI-TARTE-FRAISE-2"]);
      const sku = await proposeSku("PATI-TARTE-FRAISE", taken);
      expect(sku.value).toBe("PATI-TARTE-FRAISE-3");
    });

    it("tronque pour rester sous la longueur maximale, sans tiret orphelin", async () => {
      const root = `${"A".repeat(SKU_MAX_LENGTH - 1)}-B`;
      const sku = await proposeSku(root, availabilityOf([]));

      expect(sku.value.length).toBeLessThanOrEqual(SKU_MAX_LENGTH);
      expect(sku.value.endsWith("-")).toBe(false);
    });

    it("laisse place au suffixe lors de la troncature", async () => {
      const root = "A".repeat(SKU_MAX_LENGTH);
      const sku = await proposeSku(root, availabilityOf([root]));

      expect(sku.value.length).toBeLessThanOrEqual(SKU_MAX_LENGTH);
      expect(sku.value.endsWith("-2")).toBe(true);
    });

    it("échoue franchement plutôt que de boucler", async () => {
      const everything: SkuAvailability = {
        isTaken: (): Promise<boolean> => Promise.resolve(true),
      };
      await expect(proposeSku("VIEN-CROISS", everything)).rejects.toThrow(
        SkuGenerationExhaustedError,
      );
    });
  });
});
