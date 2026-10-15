import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import { SetProductAudienceCommand, SetProductAudienceHandler } from "../set-product-audience.js";
import { OneProduct, PRODUCT_ID, tarte } from "./audience-doubles.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";

/** L'audience d'une fiche (1c du plan d'audience) : posée, rendue, journalisée. */
function setting(
  products: OneProduct,
  journal: RecordingJournal,
  audience: Audience | null,
  id = PRODUCT_ID,
): Promise<void> {
  return new SetProductAudienceHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
  ).execute(new SetProductAudienceCommand(id, audience));
}

describe("SetProductAudienceHandler", () => {
  it("restreint la fiche aux pros et le dit au journal, depuis l'héritage", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    await setting(products, journal, "pro");

    expect(products.stored?.audience).toBe("pro");
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.audience_changed",
        subjectType: "product",
        subjectId: PRODUCT_ID,
        payload: { subjectLabel: "Tarte au citron", audience: { from: null, to: "pro" } },
      }),
    ]);
  });

  it("rend la fiche à sa famille avec `null`", async () => {
    const products = new OneProduct(tarte({ audience: "public" }));
    const journal = new RecordingJournal();

    await setting(products, journal, null);

    expect(products.stored?.audience).toBeNull();
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Tarte au citron",
      audience: { from: "public", to: null },
    });
  });

  /** C1 : aucune modification d'une fiche active n'est refusée. */
  it("se règle aussi sur une fiche active", async () => {
    const products = new OneProduct(tarte({ status: "published" }));

    await setting(products, new RecordingJournal(), "public");

    expect(products.stored).toMatchObject({ status: "published", audience: "public" });
  });

  it("reste muet quand rien ne change", async () => {
    const products = new OneProduct(tarte({ audience: "both" }));
    const journal = new RecordingJournal();

    await setting(products, journal, "both");

    expect(journal.types()).toEqual([]);
  });

  it("refuse une fiche inconnue sans rien journaliser", async () => {
    const journal = new RecordingJournal();

    await expect(
      setting(new OneProduct(tarte()), journal, "pro", "prd_absent"),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(journal.types()).toEqual([]);
  });
});
