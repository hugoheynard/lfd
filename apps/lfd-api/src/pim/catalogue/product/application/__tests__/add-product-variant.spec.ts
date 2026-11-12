import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import type { SkuAvailability } from "../../domain/services/sku-generator.js";
import { AddProductVariantCommand, AddProductVariantHandler } from "../add-product-variant.js";
import { PRODUCT_ID, tarte } from "./audience-doubles.js";
import { CountingPimIds } from "./durable-doubles.js";

/** Une fiche, reconstituée à chaque lecture ; chaque écriture comptée. */
class Products extends ProductRepository {
  readonly saves: ProductSnapshot[] = [];

  constructor(private stored: ProductSnapshot) {
    super();
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(id === this.stored.id ? Product.reconstitute(this.stored) : null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([Product.reconstitute(this.stored)]);
  }
  add(product: Product): Promise<void> {
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    this.stored = product.persistenceSnapshot();
    this.saves.push(this.stored);
    return Promise.resolve();
  }
}

const FREE: SkuAvailability = { isTaken: () => Promise.resolve(false) };

let intentCount = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
const nextKey = (): string => `intent_${(intentCount += 1)}`;

function setup() {
  const products = new Products(tarte());
  const journal = new RecordingJournal();
  const handler = new AddProductVariantHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    new CountingPimIds(),
    FREE,
    new RecordingCatalogEmitter(),
    inMemoryIntents(),
  );
  return { products, journal, handler };
}

describe("AddProductVariantHandler — une fois par intention", () => {
  /** Régression : un double clic sur « Ajouter une déclinaison » en ajoutait deux. */
  it("rejouée avec la même clé, rend la même déclinaison sans en ajouter une autre", async () => {
    const { products, journal, handler } = setup();
    const command = new AddProductVariantCommand(
      PRODUCT_ID,
      { name: { fr: "Tarte au citron — grande" } },
      "staff_1",
      nextKey(),
    );

    const first = await handler.execute(command);
    const replayed = await handler.execute(command);

    expect(replayed).toBe(first);
    expect(products.saves).toHaveLength(1);
    expect(journal.entries).toHaveLength(1);
  });

  it("une clé neuve est une seconde déclinaison voulue", async () => {
    const { products, handler } = setup();
    const name = { fr: "Tarte au citron — petite" };

    await handler.execute(new AddProductVariantCommand(PRODUCT_ID, { name }, "staff_1", nextKey()));
    await handler.execute(new AddProductVariantCommand(PRODUCT_ID, { name }, "staff_1", nextKey()));

    expect(products.saves.at(-1)?.variants).toHaveLength(3);
  });
});
