import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { UuidGenerator } from "../../../platform/id/uuid-generator.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { RecordingDurable } from "./media-durable-doubles.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import { MediaSeries } from "../../domain/entities/media-series.js";
import {
  InvalidMediaSeriesShotOnError,
  MediaSeriesNotFoundError,
} from "../../domain/errors/media-series-errors.js";
import {
  MediaSeriesReader,
  MediaSeriesRepository,
  type MediaSeriesLabel,
  type MediaSeriesListing,
} from "../../domain/ports/media-series.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../../domain/ports/media-library-reader.js";
import { MediaLibraryWriter, type MediaDetails } from "../../domain/ports/media-library-writer.js";
import { DeclareMediaSeriesCommand, DeclareMediaSeriesHandler } from "../declare-media-series.js";
import {
  DescribeMediaSeriesCommand,
  DescribeMediaSeriesHandler,
} from "../describe-media-series.js";
import { ListMediaSeriesHandler } from "../list-media-series.js";
import { SaveMediaDetailsCommand, SaveMediaDetailsHandler } from "../save-media-details.js";

/**
 * 23 h 30 UTC le 15 juin = 1 h 30 le 16 à Paris : « aujourd'hui » est le 16.
 * L'horloge est figée, et les jours ci-dessous ne sont comparés qu'à elle.
 */
const NOW = new Date("2026-06-15T23:30:00.000Z");
const PARIS_TODAY = "2026-06-16";

class StubIds extends UuidGenerator {
  next(): string {
    return "series_1";
  }
}

/** Les séries en mémoire — l'écriture et la lecture sur le même stock. */
class InMemorySeries extends MediaSeriesRepository {
  readonly saved: MediaSeries[] = [];

  constructor(private readonly stock: MediaSeries[] = []) {
    super();
  }

  load(id: string): Promise<MediaSeries | null> {
    const found = this.stock.find((series) => series.id === id);
    return Promise.resolve(found === undefined ? null : MediaSeries.rehydrate(found.snapshot()));
  }

  save(series: MediaSeries, ticket: WriteTicket): Promise<void> {
    void ticket;
    this.saved.push(series);
    return Promise.resolve();
  }
}

class KnownSeries extends MediaSeriesReader {
  constructor(private readonly labels: readonly MediaSeriesLabel[]) {
    super();
  }
  list(): Promise<readonly MediaSeriesListing[]> {
    return Promise.resolve(
      this.labels.map((label) => ({
        ...label,
        shotOn: "2026-06-01",
        note: null,
        images: 3,
        createdAt: NOW,
      })),
    );
  }
  find(id: string): Promise<MediaSeriesLabel | null> {
    return Promise.resolve(this.labels.find((label) => label.id === id) ?? null);
  }
}

const SPRING: MediaSeriesLabel = { id: "series_spring", title: "Printemps" };
const SUMMER: MediaSeriesLabel = { id: "series_summer", title: "Été" };
const URL = "https://media.example/products/abc.png";

function image(series: MediaSeriesLabel | null): LibraryMediaRecord {
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
    focal: null,
    uses: 0,
    depositedAt: NOW,
    series: series === null ? null : { ...series, shotOn: null },
  };
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

class RecordingWriter extends MediaLibraryWriter {
  readonly described: MediaDetails[] = [];
  describe(url: string, details: MediaDetails, ticket: WriteTicket): Promise<boolean> {
    void url;
    void ticket;
    this.described.push(details);
    return Promise.resolve(true);
  }
  discard(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe("DeclareMediaSeriesHandler", () => {
  it("ouvre la série, rend son id, et trace son ouverture", async () => {
    const repository = new InMemorySeries();
    const journal = new RecordingMediaJournal();
    const handler = new DeclareMediaSeriesHandler(
      repository,
      new StubIds(),
      new FixedClock(NOW),
      journal,
      new DirectUnitOfWork(),
    );

    const result = await handler.execute(
      new DeclareMediaSeriesCommand({ title: " Été ", shotOn: PARIS_TODAY, note: "" }),
    );

    expect(result).toEqual({ id: "series_1" });
    expect(repository.saved[0]?.snapshot()).toEqual({
      id: "series_1",
      title: "Été",
      shotOn: PARIS_TODAY,
      note: null,
    });
    expect(journal.entries).toEqual([
      {
        type: "media_series.created",
        subjectType: "media_series",
        subjectId: "series_1",
        payload: { subjectLabel: "Été", title: "Été", shotOn: PARIS_TODAY, note: null },
      },
    ]);
  });

  it("lit « aujourd'hui » à l'heure de Paris, et refuse le lendemain", async () => {
    const repository = new InMemorySeries();
    const handler = new DeclareMediaSeriesHandler(
      repository,
      new StubIds(),
      new FixedClock(NOW),
      new RecordingMediaJournal(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new DeclareMediaSeriesCommand({ title: "x", shotOn: "2026-06-17", note: null }),
      ),
    ).rejects.toThrow(InvalidMediaSeriesShotOnError);
    expect(repository.saved).toEqual([]);
  });
});

describe("DescribeMediaSeriesHandler", () => {
  const existing = (): MediaSeries =>
    MediaSeries.rehydrate({ id: "series_1", title: "Été", shotOn: null, note: null });

  it("corrige par la méthode métier et trace le diff seul", async () => {
    const repository = new InMemorySeries([existing()]);
    const journal = new RecordingMediaJournal();
    const handler = new DescribeMediaSeriesHandler(
      repository,
      new FixedClock(NOW),
      journal,
      new DirectUnitOfWork(),
    );

    await handler.execute(
      new DescribeMediaSeriesCommand("series_1", {
        title: "Été",
        shotOn: "2026-06-01",
        note: null,
      }),
    );

    expect(repository.saved[0]?.snapshot().shotOn).toBe("2026-06-01");
    expect(journal.entries[0]).toEqual({
      type: "media_series.described",
      subjectType: "media_series",
      subjectId: "series_1",
      payload: { subjectLabel: "Été", changes: { shotOn: { from: null, to: "2026-06-01" } } },
    });
  });

  it("ne trace rien quand rien ne change, mais range quand même", async () => {
    const repository = new InMemorySeries([existing()]);
    const journal = new RecordingMediaJournal();
    const handler = new DescribeMediaSeriesHandler(
      repository,
      new FixedClock(NOW),
      journal,
      new DirectUnitOfWork(),
    );

    await handler.execute(
      new DescribeMediaSeriesCommand("series_1", { title: "Été", shotOn: null, note: "" }),
    );

    expect(journal.entries).toEqual([]);
    expect(repository.saved).toHaveLength(1);
  });

  it("rend 404 nommé sur une série inconnue", async () => {
    const handler = new DescribeMediaSeriesHandler(
      new InMemorySeries(),
      new FixedClock(NOW),
      new RecordingMediaJournal(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new DescribeMediaSeriesCommand("nope", { title: "x", shotOn: null, note: null }),
      ),
    ).rejects.toThrow(MediaSeriesNotFoundError);
  });
});

describe("ListMediaSeriesHandler", () => {
  it("rend les séries en JSON, compte d'images compris", async () => {
    const handler = new ListMediaSeriesHandler(new KnownSeries([SUMMER]));

    expect(await handler.execute()).toEqual([
      {
        id: SUMMER.id,
        title: SUMMER.title,
        shotOn: "2026-06-01",
        note: null,
        images: 3,
        createdAt: NOW.toISOString(),
      },
    ]);
  });
});

describe("SaveMediaDetailsHandler — la série d'une image", () => {
  function handlerFor(current: MediaSeriesLabel | null) {
    const writer = new RecordingWriter();
    const journal = new RecordingMediaJournal();
    const handler = new SaveMediaDetailsHandler(
      writer,
      new OneImage(image(current)),
      new KnownSeries([SPRING, SUMMER]),
      journal,
      new DirectUnitOfWork(),
      new RecordingDurable(),
      new StubIds(),
    );
    return { handler, writer, journal };
  }

  const save = (seriesId?: string | null): SaveMediaDetailsCommand =>
    new SaveMediaDetailsCommand(
      URL,
      "Croissant",
      ["viennoiserie"],
      { fr: "Un croissant" },
      null,
      seriesId,
    );

  it("ABSENTE ne change rien — ni série, ni fait", async () => {
    // Le panneau renvoie tous ses champs : un écran qui ignore les séries ne
    // doit pas détacher l'image en enregistrant son étiquette.
    const { handler, writer, journal } = handlerFor(SPRING);

    await handler.execute(save(undefined));

    expect(writer.described[0]?.seriesId).toBe(SPRING.id);
    expect(journal.entries).toEqual([]);
  });

  it("rattache, et le diff cite les deux séries par leur titre", async () => {
    const { handler, writer, journal } = handlerFor(SPRING);

    await handler.execute(save(SUMMER.id));

    expect(writer.described[0]?.seriesId).toBe(SUMMER.id);
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Croissant",
      changes: {
        series: {
          from: { id: SPRING.id, name: SPRING.title },
          to: { id: SUMMER.id, name: SUMMER.title },
        },
      },
    });
  });

  it("détache par null", async () => {
    const { handler, writer, journal } = handlerFor(SPRING);

    await handler.execute(save(null));

    expect(writer.described[0]?.seriesId).toBeNull();
    expect(journal.entries[0]?.payload).toMatchObject({
      changes: { series: { from: { id: SPRING.id, name: SPRING.title }, to: null } },
    });
  });

  it("refuse une série inconnue en 404 nommé, sans rien écrire", async () => {
    const { handler, writer } = handlerFor(null);

    await expect(handler.execute(save("series_gone"))).rejects.toThrow(MediaSeriesNotFoundError);
    expect(writer.described).toEqual([]);
  });
});
