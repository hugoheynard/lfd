import { MediaAssetDescribedFact } from "../../../../../media/channels/carriers/media-asset-described.fact.js";
import { PIM_PRODUCT_MEDIA_CHANGED } from "../../../../channels/b2b-platform/products/product-media-changed.fact.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../../domain/ports/editorial-reader.js";
import { ProductImageUsage } from "../../domain/ports/product-image-usage.js";
import { OnMediaAssetDescribedHandler } from "../on-media-asset-described.js";
import { CountingPimIds, RecordingDurable } from "./durable-doubles.js";

const URL = "https://media.example/products/abc.jpg";

const record = (role: string, focal: ProductMediaRecord["focal"]): ProductMediaRecord => ({
  role,
  url: URL,
  name: "",
  alt: { fr: "Un croissant" },
  width: 800,
  height: 600,
  bytes: null,
  contentType: null,
  focal,
});

class Usage extends ProductImageUsage {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly products: readonly string[]) {
    super();
  }
  productsShowing(url: string, roles: readonly string[]): Promise<readonly string[]> {
    void url;
    this.asked.push(roles);
    return Promise.resolve(this.products);
  }
}

class Visuals extends EditorialReader {
  findByProduct(): Promise<ProductEditorialView | null> {
    return Promise.resolve(null);
  }
  findByProducts(): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return Promise.resolve(new Map());
  }
  mediaOf(): Promise<readonly ProductMediaRecord[]> {
    return Promise.resolve([record("thumbnail", { x: 0.2, y: 0.8 })]);
  }
  mediaOfProducts(): Promise<ReadonlyMap<string, readonly ProductMediaRecord[]>> {
    return Promise.resolve(new Map());
  }
}

async function deliver(usage: Usage, durable: RecordingDurable): Promise<void> {
  const fact = new MediaAssetDescribedFact(URL, "g_media").durableFact();
  await new OnMediaAssetDescribedHandler(
    usage,
    new Visuals(),
    durable,
    new CountingPimIds(),
  ).handle({ eventId: "evt_1", ...fact });
}

/**
 * L4 (2026-10-10) : un point focal déplacé à la médiathèque n'arrivait en
 * boutique qu'au prochain enregistrement de la fiche ou au prochain push.
 */
describe("OnMediaAssetDescribedHandler — réannoncer les fiches qui portent l'image", () => {
  it("réannonce chaque fiche, point focal relu, un geste neuf par fiche", async () => {
    const durable = new RecordingDurable();
    const usage = new Usage(["prd_1", "prd_2"]);

    await deliver(usage, durable);

    expect(usage.asked).toEqual([["hero", "thumbnail"]]);
    expect(durable.facts.map((fact) => fact.key)).toEqual([
      `${PIM_PRODUCT_MEDIA_CHANGED}:prd_1:geste_1`,
      `${PIM_PRODUCT_MEDIA_CHANGED}:prd_2:geste_2`,
    ]);
    expect(durable.facts[0]?.payload).toMatchObject({
      image: null,
      thumbnail: { url: URL, focal: { x: 0.2, y: 0.8 } },
    });
  });

  it("n'annonce rien quand aucune fiche ne montre l'image", async () => {
    const durable = new RecordingDurable();

    await deliver(new Usage([]), durable);

    expect(durable.facts).toEqual([]);
  });
});
