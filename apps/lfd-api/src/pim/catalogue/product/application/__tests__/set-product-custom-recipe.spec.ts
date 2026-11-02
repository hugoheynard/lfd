import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import {
  SetProductCustomRecipeCommand,
  SetProductCustomRecipeHandler,
} from "../set-product-custom-recipe.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { OneProduct, PRODUCT_ID, tarte } from "./audience-doubles.js";

/**
 * La case « Sur mesure » de la fiche (`plan-articles-sur-mesure.md` § 13, D1).
 * Ce que ces cas tiennent : le geste passe par l'agrégat, s'écrit, s'émet au
 * catalogue — c'est le commerce qui en tire D3 — et se journalise, ou se tait
 * quand rien n'a bougé.
 */

async function declare(
  products: OneProduct,
  journal: RecordingJournal,
  customRecipe: boolean,
  id = PRODUCT_ID,
  emitter = new RecordingCatalogEmitter(),
): Promise<void> {
  await new SetProductCustomRecipeHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    emitter,
  ).execute(new SetProductCustomRecipeCommand(id, customRecipe));
}

describe("SetProductCustomRecipeHandler — sur mesure", () => {
  it("coche la case, l'émet au catalogue et le dit au journal", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await declare(products, journal, true, PRODUCT_ID, emitter);

    expect(products.stored?.customRecipe).toBe(true);
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.custom_recipe_changed",
        subjectType: "product",
        subjectId: PRODUCT_ID,
        payload: { subjectLabel: "Tarte au citron", from: false, to: true },
      }),
    ]);
  });

  it("la décoche, et le journal dit dans quel sens", async () => {
    const products = new OneProduct(tarte({ customRecipe: true }));
    const journal = new RecordingJournal();

    await declare(products, journal, false);

    expect(products.stored?.customRecipe).toBe(false);
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.custom_recipe_changed",
        payload: { subjectLabel: "Tarte au citron", from: true, to: false },
      }),
    ]);
  });

  it("reste muet quand la case est réenregistrée à l'identique", async () => {
    const products = new OneProduct(tarte({ customRecipe: true }));
    const journal = new RecordingJournal();

    await declare(products, journal, true);

    expect(products.stored?.customRecipe).toBe(true);
    expect(journal.types()).toEqual([]);
  });

  it("refuse une fiche inconnue sans rien journaliser ni émettre", async () => {
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await expect(
      declare(new OneProduct(tarte()), journal, true, "prd_absent", emitter),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(journal.types()).toEqual([]);
    expect(emitter.products).toEqual([]);
  });
});
