import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  CATEGORY_ID,
  OneCategory,
  OneProduct,
  PRODUCT_ID,
  family,
  tarte,
} from "../../../product/application/__tests__/audience-doubles.js";
import {
  SetCategoryAudienceCommand,
  SetCategoryAudienceHandler,
} from "../../../category/application/set-category-audience.js";
import {
  SetProductAudienceCommand,
  SetProductAudienceHandler,
} from "../../../product/application/set-product-audience.js";
import { CatalogEmitter } from "../../domain/ports/catalog-emitter.js";
import { CatalogReemission, type ReemissionReport } from "../../domain/ports/catalog-reemission.js";

/**
 * **Où** un geste émet (2a3, C4) : la fiche DANS sa transaction, en dernière
 * instruction ; les fiches d'une famille APRÈS la transaction du geste, une
 * par une — jamais toutes sous le verrou du geste.
 *
 * Deux handlers représentatifs, un par forme ; l'inventaire complet est
 * rendu avec le lot, et l'e2e éprouve ce qui part réellement.
 */

class Timeline {
  readonly events: string[] = [];
}

class TimelineUnitOfWork extends UnitOfWork {
  constructor(private readonly timeline: Timeline) {
    super();
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.timeline.events.push("begin");
    const result = await work();
    this.timeline.events.push("commit");
    return result;
  }
}

class TimelineEmitter extends CatalogEmitter {
  constructor(private readonly timeline: Timeline) {
    super();
  }
  emitProducts(ids: readonly string[]): Promise<void> {
    this.timeline.events.push(`emit:product:${ids.join(",")}`);
    return Promise.resolve();
  }
  emitCategories(ids: readonly string[]): Promise<void> {
    this.timeline.events.push(`emit:category:${ids.join(",")}`);
    return Promise.resolve();
  }
}

class TimelineReemission extends CatalogReemission {
  constructor(private readonly timeline: Timeline) {
    super();
  }
  productsOfCategories(ids: readonly string[]): Promise<void> {
    this.timeline.events.push(`reemit:family:${ids.join(",")}`);
    return Promise.resolve();
  }
  everything(): Promise<ReemissionReport> {
    this.timeline.events.push("reemit:everything");
    return Promise.resolve({ categories: 0, products: 0, failedProducts: [] });
  }
}

describe("l'émission des faits du catalogue, vue des gestes", () => {
  it("une fiche s'émet en dernière instruction de SA transaction", async () => {
    const timeline = new Timeline();

    await new SetProductAudienceHandler(
      new OneProduct(tarte()),
      new RecordingJournal(),
      new TimelineUnitOfWork(timeline),
      new TimelineEmitter(timeline),
    ).execute(new SetProductAudienceCommand(PRODUCT_ID, "pro"));

    expect(timeline.events).toEqual(["begin", `emit:product:${PRODUCT_ID}`, "commit"]);
  });

  it("une famille s'émet dans sa transaction ; ses fiches APRÈS, hors du verrou du geste", async () => {
    const timeline = new Timeline();

    await new SetCategoryAudienceHandler(
      new OneCategory(family("both")),
      new RecordingJournal(),
      new TimelineUnitOfWork(timeline),
      new TimelineEmitter(timeline),
      new TimelineReemission(timeline),
    ).execute(new SetCategoryAudienceCommand(CATEGORY_ID, "pro"));

    expect(timeline.events).toEqual([
      "begin",
      `emit:category:${CATEGORY_ID}`,
      "commit",
      `reemit:family:${CATEGORY_ID}`,
    ]);
  });
});
