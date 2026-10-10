import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { UuidGenerator } from "../../../platform/id/uuid-generator.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import { MEDIA_ASSET_DESCRIBED } from "../../channels/carriers/media-asset-described.fact.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../../domain/ports/media-library-reader.js";
import { MediaLibraryWriter, type MediaDetails } from "../../domain/ports/media-library-writer.js";
import {
  MediaSeriesReader,
  type MediaSeriesLabel,
  type MediaSeriesListing,
} from "../../domain/ports/media-series.js";
import type { FocalPoint } from "../../domain/value-objects/image.js";
import { SaveMediaDetailsCommand, SaveMediaDetailsHandler } from "../save-media-details.js";
import { RecordingDurable } from "./media-durable-doubles.js";

const URL = "https://media.example/products/abc.png";
const DEPOSITED_AT = new Date(0);

class GestureIds extends UuidGenerator {
  next(): string {
    return "geste_1";
  }
}

class NoSeries extends MediaSeriesReader {
  list(): Promise<readonly MediaSeriesListing[]> {
    return Promise.resolve([]);
  }
  find(): Promise<MediaSeriesLabel | null> {
    return Promise.resolve(null);
  }
}

class OneImage extends MediaLibraryReader {
  constructor(private readonly record: LibraryMediaRecord) {
    super();
  }
  page(): Promise<LibraryMediaPage> {
    return Promise.resolve({ items: [this.record], total: 1, next: null });
  }
  find(url: string): Promise<LibraryMediaRecord | null> {
    return Promise.resolve(url === this.record.url ? this.record : null);
  }
}

class SilentWriter extends MediaLibraryWriter {
  describe(url: string, details: MediaDetails, ticket: WriteTicket): Promise<boolean> {
    void url;
    void details;
    void ticket;
    return Promise.resolve(true);
  }
  discard(): Promise<number> {
    return Promise.resolve(0);
  }
}

function image(focal: FocalPoint | null): LibraryMediaRecord {
  return {
    url: URL,
    name: "Croissant",
    tags: ["viennoiserie"],
    alt: { fr: "Un croissant" },
    storageKey: "products/abc.png",
    contentType: "image/png",
    width: 400,
    height: 400,
    bytes: 24,
    focal,
    uses: 1,
    depositedAt: DEPOSITED_AT,
    series: null,
  };
}

function setup(focal: FocalPoint | null) {
  const durable = new RecordingDurable();
  const handler = new SaveMediaDetailsHandler(
    new SilentWriter(),
    new OneImage(image(focal)),
    new NoSeries(),
    new RecordingMediaJournal(),
    new DirectUnitOfWork(),
    durable,
    new GestureIds(),
  );
  return { handler, durable };
}

const save = (
  focal: FocalPoint | null,
  overrides: { tags?: string[]; alt?: string } = {},
): SaveMediaDetailsCommand =>
  new SaveMediaDetailsCommand(
    URL,
    "Croissant",
    overrides.tags ?? ["viennoiserie"],
    { fr: overrides.alt ?? "Un croissant" },
    focal,
  );

/**
 * L4 (2026-10-10) : la vitrine garde une COPIE du cadrage. Sans annonce, un
 * point focal déplacé à la médiathèque n'arrivait en boutique qu'au prochain
 * enregistrement de la fiche ou au prochain push.
 */
describe("SaveMediaDetailsHandler — l'annonce aux porteurs", () => {
  it("annonce l'image quand son point focal bouge", async () => {
    const { handler, durable } = setup(null);

    await handler.execute(save({ x: 0.3, y: 0.7 }));

    expect(durable.facts).toEqual([
      {
        type: MEDIA_ASSET_DESCRIBED,
        key: `${MEDIA_ASSET_DESCRIBED}:geste_1`,
        payload: { url: URL, gestureId: "geste_1" },
      },
    ]);
  });

  it("annonce l'image quand son alternative change", async () => {
    const { handler, durable } = setup(null);

    await handler.execute(save(null, { alt: "Un croissant doré" }));

    expect(durable.facts).toHaveLength(1);
  });

  it("n'annonce rien pour un tag : aucun porteur ne le recopie", async () => {
    const { handler, durable } = setup(null);

    await handler.execute(save(null, { tags: ["viennoiserie", "beurre"] }));

    expect(durable.facts).toEqual([]);
  });

  it("n'annonce rien quand rien n'a bougé", async () => {
    const { handler, durable } = setup({ x: 0.3, y: 0.7 });

    await handler.execute(save({ x: 0.3, y: 0.7 }));

    expect(durable.facts).toEqual([]);
  });
});
