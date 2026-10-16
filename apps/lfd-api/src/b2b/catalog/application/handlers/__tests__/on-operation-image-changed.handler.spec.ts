import {
  OperationImageChangedFact,
  OperationImageChangedPayloadError,
  PIM_OPERATION_IMAGE_CHANGED,
} from "../../../../../pim/channels/b2b-platform/operations/operation-image-changed.fact.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import type { OperationImageFacts } from "../../../domain/entities/catalog-operation.js";
import { CatalogOperationImageProjection } from "../../../domain/ports/catalog-operation-image.projection.js";
import { OnOperationImageChangedHandler } from "../on-operation-image-changed.handler.js";

interface Shown {
  readonly operationKey: string;
  readonly gestureId: string;
  readonly image: OperationImageFacts | null;
}

/** Une projection qui retient ce qu'on lui a demandé. L'ordre se prouve en e2e. */
class SpyingImages extends CatalogOperationImageProjection {
  readonly shown: Shown[] = [];

  showIfNewer(
    operationKey: string,
    gestureId: string,
    image: OperationImageFacts | null,
  ): Promise<void> {
    this.shown.push({ operationKey, gestureId, image });
    return Promise.resolve();
  }
}

/** L'interrupteur `OPERATIONS_AT_COMMERCE`, posé à la main. */
class OperationsAt extends AppConfig {
  constructor(private readonly commerce: boolean) {
    super();
  }
  override operationsAtCommerce(): boolean {
    return this.commerce;
  }
}

const CLOSED = new OperationsAt(false);

describe("OnOperationImageChanged", () => {
  /** Régression du 2026-10-11 : l'image d'une opération ne suivait qu'au push. */
  it("projette l'image et son point, sous le geste du référentiel", async () => {
    const images = new SpyingImages();
    const image = { url: "https://m.test/b.jpg", alt: "Une bûche", focal: { x: 0.1, y: 0.4 } };
    const fact = new OperationImageChangedFact("noel", "geste_7", image).durableFact();

    await new OnOperationImageChangedHandler(images, CLOSED).handle({ eventId: "evt_1", ...fact });

    expect(images.shown).toEqual([{ operationKey: "noel", gestureId: "geste_7", image }]);
  });

  it("projette l'absence d'image", async () => {
    const images = new SpyingImages();
    const fact = new OperationImageChangedFact("noel", "geste_8", null).durableFact();

    await new OnOperationImageChangedHandler(images, CLOSED).handle({ eventId: "evt_1", ...fact });

    expect(images.shown).toEqual([{ operationKey: "noel", gestureId: "geste_8", image: null }]);
  });

  it("lève sur un payload illisible, pour que la boîte d'envoi rejoue", async () => {
    const images = new SpyingImages();

    await expect(
      new OnOperationImageChangedHandler(images, CLOSED).handle({
        eventId: "evt_1",
        type: PIM_OPERATION_IMAGE_CHANGED,
        payload: { operationKey: "noel" },
      }),
    ).rejects.toThrow(OperationImageChangedPayloadError);
    expect(images.shown).toEqual([]);
  });

  /** Lot 3 : l'image d'une opération est celle du commerce ; le fait du référentiel n'a plus de destinataire. */
  it("n'écrit rien interrupteur ouvert, et acquitte sans lever", async () => {
    const images = new SpyingImages();
    const fact = new OperationImageChangedFact("noel", "geste_9", null).durableFact();

    await new OnOperationImageChangedHandler(images, new OperationsAt(true)).handle({
      eventId: "evt_1",
      ...fact,
    });

    expect(images.shown).toEqual([]);
  });
});
