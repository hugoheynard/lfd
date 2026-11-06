import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import {
  OperationImageLibrary,
  type LibraryImage,
} from "../../../../operations/channels/media/operation-image-library.js";
import { PrismaStoredOrderCutoffReader } from "../../../../order-cutoffs/infrastructure/prisma-stored-order-cutoff.reader.js";
import { SnapshotStoredOrderCutoffReader } from "../../../../order-cutoffs/infrastructure/snapshot-stored-order-cutoff.reader.js";
import { PrismaCatalogOperationsReader } from "../../prisma-catalog-operations.reader.js";
import { PrismaOrderLineClassificationReader } from "../../prisma-order-line-classification.reader.js";
import { SnapshotCatalogOperationsReader } from "../snapshot-catalog-operations.reader.js";
import { SnapshotOrderLineClassificationReader } from "../snapshot-order-line-classification.reader.js";
import { article, inQuote, snapshotModule } from "./snapshot-doubles.js";

/** La médiathèque, jamais appelée par les chemins éprouvés ici. */
class SilentLibrary extends OperationImageLibrary {
  describe(): Promise<LibraryImage | null> {
    return Promise.resolve(null);
  }

  describeMany(): Promise<ReadonlyMap<string, LibraryImage>> {
    return Promise.resolve(new Map());
  }
}

async function setup() {
  const built = await snapshotModule([
    SnapshotOrderLineClassificationReader,
    PrismaOrderLineClassificationReader,
    SnapshotCatalogOperationsReader,
    PrismaCatalogOperationsReader,
    SnapshotStoredOrderCutoffReader,
    PrismaStoredOrderCutoffReader,
    { provide: OperationImageLibrary, useClass: SilentLibrary },
  ]);
  return built;
}

describe("les lectures C, D et l'heure limite sur l'instantané", () => {
  it("le classement : produit, famille, sur mesure — depuis l'instantané", async () => {
    const { base, moduleRef } = await setup();
    base.articles = [article("A-1", { customRecipe: true }), article("V-2", { isDefault: false })];
    const reader = moduleRef.get(SnapshotOrderLineClassificationReader);
    const classified = await inQuote(() => reader.classify(["A-1", "V-2"]));
    expect([...classified]).toEqual([
      [
        "A-1",
        { productId: "prod-A-1", categoryId: "fam-a", categoryPath: ["fam-a"], madeToOrder: true },
      ],
    ]);
  });

  it("les SKU réservés aux opérations : un filtre sur le drapeau", async () => {
    const { base, moduleRef } = await setup();
    base.articles = [article("A-1"), article("OP-1", { operationOnly: true })];
    const reader = moduleRef.get(SnapshotCatalogOperationsReader);
    await expect(inQuote(() => reader.operationOnlySkus())).resolves.toEqual(new Set(["OP-1"]));
  });

  it("l'heure limite générale vient du morceau order_cutoffs", async () => {
    const { base, moduleRef } = await setup();
    const reader = moduleRef.get(SnapshotStoredOrderCutoffReader);
    const general = await inQuote(() => reader.general());
    expect(general).toMatchObject({ id: "cut-1", daysBefore: 1, time: "18:00", weekday: null });
    expect(base.calls).toEqual(["versions", "cutoff"]);
  });

  it("hors de la portée, l'heure limite est relue en base comme avant", async () => {
    const { base, moduleRef } = await setup();
    const reader = moduleRef.get(SnapshotStoredOrderCutoffReader);
    await runWithRequestContext({ now: new Date(0), traceId: "écran" }, () => reader.general());
    expect(base.calls).toEqual(["cutoff"]);
  });
});
