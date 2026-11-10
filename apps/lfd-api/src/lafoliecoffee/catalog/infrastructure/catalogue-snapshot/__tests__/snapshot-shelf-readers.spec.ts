import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import {
  OperationImageLibrary,
  type LibraryImage,
} from "../../../../operations/channels/media/operation-image-library.js";
import { PrismaCatalogOperationsReader } from "../../prisma-catalog-operations.reader.js";
import { PrismaCatalogPricePerKgReader } from "../../prisma-catalog-price-per-kg.reader.js";
import { PrismaDefaultSaleReferenceReader } from "../../prisma-default-sale-reference.reader.js";
import { SnapshotCatalogOperationsReader } from "../snapshot-catalog-operations.reader.js";
import { SnapshotCatalogPricePerKgReader } from "../snapshot-catalog-price-per-kg.reader.js";
import { SnapshotDefaultSaleReferenceReader } from "../snapshot-default-sale-reference.reader.js";
import { article, inQuote, operation, snapshotModule } from "./snapshot-doubles.js";

/** La médiathèque : elle décrit ce qu'on lui demande, et retient les demandes. */
class DescribingLibrary extends OperationImageLibrary {
  readonly asked: (readonly string[])[] = [];

  describe(): Promise<LibraryImage | null> {
    return Promise.resolve(null);
  }

  describeMany(urls: readonly string[]): Promise<ReadonlyMap<string, LibraryImage>> {
    this.asked.push(urls);
    return Promise.resolve(
      new Map(
        urls.map((url) => [url, { url, alt: `alt ${url}`, width: 1, height: 1, focal: null }]),
      ),
    );
  }
}

async function setup() {
  const library = new DescribingLibrary();
  const built = await snapshotModule([
    SnapshotCatalogOperationsReader,
    PrismaCatalogOperationsReader,
    SnapshotCatalogPricePerKgReader,
    PrismaCatalogPricePerKgReader,
    SnapshotDefaultSaleReferenceReader,
    PrismaDefaultSaleReferenceReader,
    { provide: OperationImageLibrary, useValue: library },
  ]);
  return { ...built, library };
}

/** Une requête hors de la portée — un écran du personnel. */
function onScreen<T>(work: () => Promise<T>): Promise<T> {
  return runWithRequestContext({ now: new Date(0), traceId: "écran" }, work);
}

describe("les opérations du rayon sur l'instantané (lot M2)", () => {
  it("le morceau `operations`, jugé comme en base : la masquée et la sans clientèle sortent", async () => {
    const { base, moduleRef } = await setup();
    base.operations = [
      operation("noel"),
      operation("cachee", { hidden: true }),
      operation("paques", { audience: "pro", items: [{ sku: "OP-2" }] }),
    ];
    const reader = moduleRef.get(SnapshotCatalogOperationsReader);
    const sellable = await inQuote(() => reader.sellableOperations());
    expect(sellable.map((op) => [op.key, op.audience, op.skus])).toEqual([
      ["noel", "both", ["OP-1"]],
      ["paques", "pro", ["OP-2"]],
    ]);
    expect(base.calls).toEqual(["versions", "operations"]);
  });

  it("à chaud, aucune relecture des opérations ; les textes des images, à chaque fois", async () => {
    const { base, moduleRef, library } = await setup();
    base.operations = [operation("noel", { imageUrl: "https://img/noel.webp" })];
    const reader = moduleRef.get(SnapshotCatalogOperationsReader);
    await inQuote(() => reader.sellableOperations());
    const warm = await inQuote(() => reader.sellableOperations());
    expect(base.calls).toEqual(["versions", "operations", "versions"]);
    expect(library.asked).toEqual([["https://img/noel.webp"], ["https://img/noel.webp"]]);
    expect(warm[0]?.image?.alt).toBe("alt https://img/noel.webp");
  });

  it("hors de la portée, les opérations sont relues en base comme avant", async () => {
    const { base, moduleRef } = await setup();
    const reader = moduleRef.get(SnapshotCatalogOperationsReader);
    await onScreen(() => reader.sellableOperations());
    expect(base.calls).toEqual(["base:operations"]);
  });
});

describe("le prix au kilo du rayon sur l'instantané (lecture E)", () => {
  it("les deux colonnes du kilo, prises dans l'index ; un SKU inconnu est absent", async () => {
    const { base, moduleRef } = await setup();
    base.articles = [
      article("KG-1", { proPricePerKgMillicents: 1_240_000, publicPricePerKgTtcCents: 1_590 }),
    ];
    const reader = moduleRef.get(SnapshotCatalogPricePerKgReader);
    const prices = await inQuote(() => reader.bySkus(["KG-1", "INCONNU"]));
    expect([...prices]).toEqual([
      ["KG-1", { proPricePerKgMillicents: 1_240_000, publicPricePerKgTtcCents: 1_590 }],
    ]);
  });

  it("hors de la portée : la base, sans lire les numéros", async () => {
    const { base, moduleRef } = await setup();
    const reader = moduleRef.get(SnapshotCatalogPricePerKgReader);
    await onScreen(() => reader.bySkus(["KG-1"]));
    expect(base.calls).not.toContain("versions");
  });
});

describe("le défaut des tuiles de la vitrine sur l'instantané", () => {
  it("l'article défaut de chaque fiche demandée, sous sa référence de vente", async () => {
    const { base, moduleRef } = await setup();
    base.articles = [
      article("P1-A", { productSku: "P1", isDefault: false }),
      article("P1-B", { productSku: "P1" }),
      article("P2-A", { productSku: "P2" }),
    ];
    const reader = moduleRef.get(SnapshotDefaultSaleReferenceReader);
    const references = await inQuote(() => reader.ofProducts(["P1"]));
    expect([...references]).toEqual([["P1", "P1-B"]]);
  });

  it("hors de la portée : la base, sans lire les numéros", async () => {
    const { base, moduleRef } = await setup();
    const reader = moduleRef.get(SnapshotDefaultSaleReferenceReader);
    await onScreen(() => reader.ofProducts(["P1"]));
    expect(base.calls).not.toContain("versions");
  });
});
