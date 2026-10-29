import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import {
  DefaultVariantChangeSuspendedError,
  VariantAlreadyDefaultError,
} from "../../domain/errors/variant-lifecycle-errors.js";
import { DefaultVariantChangeGate } from "../../domain/ports/default-variant-change-gate.js";
import { DefaultVariantChangeClosedUntilSwitch } from "../../domain/services/default-variant-change-closed.js";
import { NutritionValuesRepository } from "../../domain/ports/nutrition-values.repository.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../../domain/ports/variant-allergens.repository.js";
import type {
  AllergenDeclaration,
  NutritionValues,
} from "../../domain/value-objects/nutrition-declaration.js";
import { MakeVariantDefaultCommand, MakeVariantDefaultHandler } from "../make-variant-default.js";
import { bareVariant, PRODUCT_ID, tarte } from "./audience-doubles.js";

/**
 * **Changer la déclinaison par défaut** (`plan-gestes-de-declinaison.md`, G4) :
 * ce que le handler écrit, journalise et émet. Ce qui suit le défaut est tenu
 * par l'agrégat (suite du domaine).
 */

const OLD_ID = "prd_tarte_v1";
const NEW_ID = "prd_tarte_v2";

class Products extends ProductRepository {
  stored: ProductSnapshot;
  saves = 0;
  constructor(snapshot: ProductSnapshot) {
    super();
    this.stored = snapshot;
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(id === this.stored.id ? Product.reconstitute(this.stored) : null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([Product.reconstitute(this.stored)]);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(product: Product): Promise<void> {
    this.saves += 1;
    this.stored = product.persistenceSnapshot();
    return Promise.resolve();
  }
}

class Allergens extends VariantAllergensRepository {
  readonly saved = new Map<string, AllergenDeclaration>();
  save(variantId: string, declaration: AllergenDeclaration): Promise<void> {
    this.saved.set(variantId, declaration);
    return Promise.resolve();
  }
}

class Nutrition extends NutritionValuesRepository {
  readonly saved = new Map<string, NutritionValues>();
  save(variantId: string, values: NutritionValues): Promise<void> {
    this.saved.set(variantId, values);
    return Promise.resolve();
  }
}

/**
 * La porte OUVERTE, celle que le L3 reliera : le geste lui-même reste éprouvé
 * pendant qu'il est fermé en production (`plan-defaut-sous-sa-reference.md`, D-b).
 */
class OpenGate extends DefaultVariantChangeGate {
  assertOpen(): void {}
}

function setup(
  newOver: Parameters<typeof bareVariant>[0] = {},
  gate: DefaultVariantChangeGate = new OpenGate(),
) {
  const products = new Products(
    tarte({
      variants: [
        bareVariant({ priceCents: 3_200, allergenSheet: { declared: ["milk"], mayContain: [] } }),
        bareVariant({
          id: NEW_ID,
          sku: "PAT-7-2",
          name: { fr: "Six parts" },
          isDefault: false,
          position: 1,
          pricingFollowsDefault: true,
          regulatoryFollowsDefault: true,
          ...newOver,
        }),
      ],
    }),
  );
  const journal = new RecordingJournal();
  const emitter = new RecordingCatalogEmitter();
  const allergens = new Allergens();
  const nutrition = new Nutrition();
  const handler = new MakeVariantDefaultHandler(
    products,
    allergens,
    nutrition,
    journal,
    new DirectUnitOfWork(),
    emitter,
    gate,
  );
  return { handler, products, journal, emitter, allergens, nutrition };
}

describe("MakeVariantDefaultHandler", () => {
  it("bascule, écrit en propre ce qu'elle voyait, journalise et émet la fiche", async () => {
    const { handler, products, journal, emitter, allergens, nutrition } = setup();

    await handler.execute(new MakeVariantDefaultCommand(PRODUCT_ID, NEW_ID));

    const promoted = products.stored.variants.find((variant) => variant.id === NEW_ID);
    expect(promoted).toMatchObject({ isDefault: true, priceCents: 3_200 });
    expect(products.stored.variants.find((v) => v.id === OLD_ID)?.isDefault).toBe(false);
    expect(allergens.saved.get(NEW_ID)).toEqual({ allergens: ["milk"], mayContain: [] });
    // Elle ne suivait pas les valeurs : rien à écrire de ce côté.
    expect(nutrition.saved.size).toBe(0);
    expect(journal.types()).toEqual(["product.default_variant_changed"]);
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("n'écrit pas les valeurs qu'elle voyait vides chez le défaut", async () => {
    const { handler, nutrition } = setup({ nutritionFollowsDefault: true });

    await handler.execute(new MakeVariantDefaultCommand(PRODUCT_ID, NEW_ID));

    expect(nutrition.saved.size).toBe(0);
  });

  it("un refus de l'agrégat n'écrit ni ne journalise rien", async () => {
    const { handler, products, journal, emitter } = setup();

    await expect(
      handler.execute(new MakeVariantDefaultCommand(PRODUCT_ID, OLD_ID)),
    ).rejects.toThrow(VariantAlreadyDefaultError);
    expect(products.saves).toBe(0);
    expect(journal.types()).toEqual([]);
    expect(emitter.products).toEqual([]);
  });

  it("fermé jusqu'à la bascule : refuse en le disant, et n'écrit, ne journalise ni n'émet rien", async () => {
    const { handler, products, journal, emitter } = setup(
      {},
      new DefaultVariantChangeClosedUntilSwitch(),
    );

    const refusal = handler.execute(new MakeVariantDefaultCommand(PRODUCT_ID, NEW_ID));

    await expect(refusal).rejects.toThrow(DefaultVariantChangeSuspendedError);
    await expect(refusal).rejects.toThrow(
      "Le changement de déclinaison par défaut revient après la bascule de la référence du défaut.",
    );
    expect(products.saves).toBe(0);
    expect(journal.types()).toEqual([]);
    expect(emitter.products).toEqual([]);
  });

  it("fermé : une demande déjà impossible garde sa vraie raison", async () => {
    const { handler } = setup({}, new DefaultVariantChangeClosedUntilSwitch());

    await expect(
      handler.execute(new MakeVariantDefaultCommand(PRODUCT_ID, OLD_ID)),
    ).rejects.toThrow(VariantAlreadyDefaultError);
  });
});
