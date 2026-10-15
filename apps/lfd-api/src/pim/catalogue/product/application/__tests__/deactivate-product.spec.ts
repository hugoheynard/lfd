import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { ArchivedProductNotWithdrawableError } from "../../domain/errors/product-errors.js";
import { DeactivateProductCommand, DeactivateProductHandler } from "../deactivate-product.js";
import { OneProduct, PRODUCT_ID, tarte } from "./audience-doubles.js";

/** **Désactiver** — l'ancien « dépublier », repris de la suite d'avant. */
function deactivating(products: OneProduct, journal: RecordingJournal): Promise<void> {
  return new DeactivateProductHandler(products, journal, new DirectUnitOfWork()).execute(
    new DeactivateProductCommand(PRODUCT_ID),
  );
}

describe("DeactivateProductHandler", () => {
  it("ramène une fiche active à l'état inactif", async () => {
    const products = new OneProduct(tarte({ status: "published" }));
    const journal = new RecordingJournal();

    await deactivating(products, journal);

    expect(products.stored?.status).toBe("draft");
    // La valeur de journal reste `product.unpublished` : elle ne se renomme pas.
    expect(journal.types()).toEqual(["product.unpublished"]);
  });

  /**
   * Régression : le handler traçait `product.unpublished` — portée comprise —
   * avant même de savoir si l'agrégat avait changé d'état (audit 2026-09-01, §1).
   */
  it("n'inscrit RIEN au journal quand la fiche était déjà inactive", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    await deactivating(products, journal);

    expect(journal.types()).toEqual([]);
    expect(products.stored?.status).toBe("draft");
  });

  /** C'est par ici que passait la RESTAURATION du back-office. */
  it("refuse une fiche archivée plutôt que de faire semblant", async () => {
    const products = new OneProduct(tarte({ status: "archived" }));
    const journal = new RecordingJournal();

    await expect(deactivating(products, journal)).rejects.toBeInstanceOf(
      ArchivedProductNotWithdrawableError,
    );
    expect(journal.types()).toEqual([]);
    expect(products.stored?.status).toBe("archived");
  });
});
