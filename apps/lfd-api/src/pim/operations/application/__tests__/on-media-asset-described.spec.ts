import { MediaAssetDescribedFact } from "../../../../media/channels/carriers/media-asset-described.fact.js";
import { PIM_OPERATION_IMAGE_CHANGED } from "../../../channels/b2b-platform/operations/operation-image-changed.fact.js";
import { ImageCatalogue, type CatalogueImage } from "../../../channels/media/image-catalogue.js";
import {
  CountingPimIds,
  RecordingDurable,
} from "../../../catalogue/product/application/__tests__/durable-doubles.js";
import {
  OperationImageUsage,
  type OperationShowingImage,
} from "../../domain/ports/operation-image-usage.js";
import { OnMediaAssetDescribedForOperationsHandler } from "../on-media-asset-described.js";

const URL = "https://media.example/products/b.jpg";

class Usage extends OperationImageUsage {
  constructor(private readonly shown: readonly OperationShowingImage[]) {
    super();
  }
  operationsShowing(url: string): Promise<readonly OperationShowingImage[]> {
    return Promise.resolve(this.shown.filter((entry) => entry.image.url === url));
  }
}

/** La médiathèque : une image, avec ou sans point ; absente si `null`. */
class Library extends ImageCatalogue {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly focal: CatalogueImage["focal"] | "absent") {
    super();
  }
  describe(urls: readonly string[]): Promise<ReadonlyMap<string, CatalogueImage>> {
    this.asked.push(urls);
    if (this.focal === "absent") {
      return Promise.resolve(new Map());
    }
    const image: CatalogueImage = {
      url: URL,
      name: "",
      alt: { fr: "La bûche de la médiathèque" },
      width: 800,
      height: 600,
      bytes: null,
      contentType: null,
      focal: this.focal,
    };
    return Promise.resolve(new Map([[URL, image]]));
  }
  has(): Promise<boolean> {
    return Promise.resolve(this.focal !== "absent");
  }
}

async function deliver(usage: Usage, library: Library, durable: RecordingDurable): Promise<void> {
  const fact = new MediaAssetDescribedFact(URL, "g_media").durableFact();
  await new OnMediaAssetDescribedForOperationsHandler(
    usage,
    library,
    durable,
    new CountingPimIds(),
  ).handle({ eventId: "evt_1", ...fact });
}

const NOEL: OperationShowingImage = { key: "noel", image: { url: URL, alt: "Une bûche" } };
const PAQUES: OperationShowingImage = { key: "paques", image: { url: URL, alt: "" } };

describe("OnMediaAssetDescribedForOperations", () => {
  /**
   * Régression du 2026-10-11 : un remplacement ou une redescription ne
   * suivait en boutique qu'au push suivant.
   */
  it("annonce l'image de chaque opération qui l'affiche, avec le point de la médiathèque", async () => {
    const durable = new RecordingDurable();
    await deliver(new Usage([NOEL, PAQUES]), new Library({ x: 0.3, y: 0.7 }), durable);

    expect(durable.facts).toEqual([
      {
        type: PIM_OPERATION_IMAGE_CHANGED,
        key: `${PIM_OPERATION_IMAGE_CHANGED}:noel:geste_1`,
        payload: {
          operationKey: "noel",
          gestureId: "geste_1",
          image: { url: URL, alt: "Une bûche", focal: { x: 0.3, y: 0.7 } },
        },
      },
      {
        type: PIM_OPERATION_IMAGE_CHANGED,
        key: `${PIM_OPERATION_IMAGE_CHANGED}:paques:geste_2`,
        payload: {
          operationKey: "paques",
          gestureId: "geste_2",
          image: { url: URL, alt: "", focal: { x: 0.3, y: 0.7 } },
        },
      },
    ]);
  });

  it("garde l'alternative de l'OPÉRATION, pas celle de la médiathèque", async () => {
    const durable = new RecordingDurable();
    await deliver(new Usage([NOEL]), new Library(null), durable);

    expect(durable.facts[0]?.payload["image"]).toEqual({ url: URL, alt: "Une bûche", focal: null });
  });

  it("part sans point quand l'image a quitté le fonds entre-temps", async () => {
    const durable = new RecordingDurable();
    await deliver(new Usage([NOEL]), new Library("absent"), durable);

    expect(durable.facts[0]?.payload["image"]).toEqual({ url: URL, alt: "Une bûche", focal: null });
  });

  it("ne publie rien, et ne lit pas la médiathèque, quand aucune opération ne l'affiche", async () => {
    const durable = new RecordingDurable();
    const library = new Library({ x: 0.5, y: 0.5 });
    await deliver(new Usage([]), library, durable);

    expect(durable.facts).toEqual([]);
    expect(library.asked).toEqual([]);
  });
});
