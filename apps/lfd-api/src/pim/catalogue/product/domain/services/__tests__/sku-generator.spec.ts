import { SkuGenerationExhaustedError } from "../../errors/sku-errors.js";
import { Sku, SKU_MAX_LENGTH } from "../../value-objects/sku.value-object.js";
import {
  productSkuRoot,
  proposeProductSku,
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

/** Tire les identifiants fournis, dans l'ordre, puis échoue plutôt que de se répéter. */
function drawing(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (id === undefined) {
      throw new Error("le générateur a tiré plus d'identifiants que le test n'en fournit");
    }
    index += 1;
    return id;
  };
}

const UUID_A = "0192f3c1-4d2e-7a3b-8c9d-1e2f3a4b5c6d";
const UUID_B = "0192f3c1-4d2e-7a3b-8c9d-99887766aabb";

describe("génération de la référence par défaut", () => {
  describe("productSkuRoot", () => {
    it("produit un préfixe et six caractères", () => {
      expect(productSkuRoot(UUID_A)).toMatch(/^P-[A-Z2-9]{6}$/u);
    });

    it("est déterministe — même identifiant, même référence", () => {
      expect(productSkuRoot(UUID_A)).toBe(productSkuRoot(UUID_A));
    });

    // Parcourt les 32 symboles atteignables (5 bits de queue) plutôt que d'inspecter
    // un code au hasard : un `O` planqué dans l'alphabet passerait sous un tirage unique.
    it("n'emploie aucun caractère ambigu, sur tout l'alphabet", () => {
      const symbols = new Set<string>();

      for (let value = 0; value < 32; value += 1) {
        const id = `0192f3c1-4d2e-7a3b-8c9d-0000000000${value.toString(16).padStart(2, "0")}`;
        symbols.add(productSkuRoot(id).slice(-1));
      }

      expect(symbols.size).toBe(32);
      expect([...symbols].join("")).not.toMatch(/[IO01]/u);
    });

    // Le préfixe d'un UUID v7 est son HORODATAGE : deux produits créés la même
    // milliseconde ne se distinguent que par la queue. La lire est le point.
    it("distingue deux identifiants qui ne diffèrent que par leur queue", () => {
      expect(productSkuRoot(UUID_A)).not.toBe(productSkuRoot(UUID_B));
    });

    // Un identifiant est une chaîne opaque : ce module n'a pas le droit d'exiger
    // une forme, seulement d'en tirer le meilleur.
    it("survit à un identifiant qui n'est pas hexadécimal", () => {
      expect(productSkuRoot("prd_zzz")).toMatch(/^P-[A-Z2-9]{6}$/u);
    });
  });

  describe("variantSkuRoot", () => {
    it("préfixe la déclinaison par la référence du produit et son rang", () => {
      const product = Sku.create("P-K7M3QT");
      expect(variantSkuRoot(product, 0)).toBe("P-K7M3QT-1");
      expect(variantSkuRoot(product, 1)).toBe("P-K7M3QT-2");
    });
  });

  describe("proposeProductSku", () => {
    it("rend la première référence tirée quand elle est libre", async () => {
      const sku = await proposeProductSku(drawing([UUID_A]), availabilityOf([]));
      expect(sku.value).toBe(productSkuRoot(UUID_A));
    });

    // Suffixer donnerait `P-XXXXXX-2`, qui se lirait comme la DÉCLINAISON n° 2
    // du produit `P-XXXXXX` — une référence qui ment sur ce qu'elle désigne.
    it("re-tire un identifiant en cas de collision, sans jamais suffixer", async () => {
      const taken = availabilityOf([productSkuRoot(UUID_A)]);
      const sku = await proposeProductSku(drawing([UUID_A, UUID_B]), taken);

      expect(sku.value).toBe(productSkuRoot(UUID_B));
      expect(sku.value).not.toMatch(/-2$/u);
    });

    it("échoue franchement plutôt que de boucler", async () => {
      const everything: SkuAvailability = {
        isTaken: (): Promise<boolean> => Promise.resolve(true),
      };
      await expect(proposeProductSku(() => UUID_A, everything)).rejects.toThrow(
        SkuGenerationExhaustedError,
      );
    });
  });

  describe("proposeSku", () => {
    it("rend la racine telle quelle quand elle est libre", async () => {
      const sku = await proposeSku("P-K7M3QT-1", availabilityOf([]));
      expect(sku.value).toBe("P-K7M3QT-1");
    });

    it("suffixe de façon lisible en cas de collision", async () => {
      const taken = availabilityOf(["P-K7M3QT-1", "P-K7M3QT-1-2"]);
      const sku = await proposeSku("P-K7M3QT-1", taken);
      expect(sku.value).toBe("P-K7M3QT-1-3");
    });

    // Une référence reprise à la main peut être longue : la déclinaison qui s'y
    // suffixe doit rester dans les clous du value object.
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
      await expect(proposeSku("P-K7M3QT-1", everything)).rejects.toThrow(
        SkuGenerationExhaustedError,
      );
    });
  });
});
