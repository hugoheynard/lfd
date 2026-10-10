import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../../platform/id/uuid-generator.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { MEDIA_ASSET_DESCRIBED } from "../../channels/carriers/media-asset-described.fact.js";
import {
  MediaCarriers,
  type Carrier,
  type ImageReplacement,
} from "../../channels/carriers/media-carriers.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../../domain/ports/media-library-reader.js";
import {
  MediaReplacedBySelfError,
  MediaReplacementUrlRequiredError,
} from "../../domain/value-objects/image-replacement.js";
import { MediaNotInLibraryError } from "../../domain/value-objects/image.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import { MEDIA_EVENTS, type MediaJournalEntry } from "../../journal/media-journal.js";
import { ReplaceMediaCommand, ReplaceMediaHandler } from "../replace-media.js";
import { RecordingDurable } from "./media-durable-doubles.js";

/**
 * Remplacer une image (L7). L'instant n'est comparé qu'à lui-même : il n'est
 * qu'inscrit, jamais confronté à l'horloge.
 */
const A = "https://media.example/products/a.jpg";
const B = "https://media.example/products/b.jpg";
const AT = new Date(Date.UTC(2026, 9, 10, 9, 0));
const STAFF = "fiche-communication";

/** Ce qui s'est passé, dans l'ordre — unité, journal, porteurs, boîte d'envoi. */
type Log = string[];

class LoggedUnitOfWork extends UnitOfWork {
  constructor(private readonly log: Log) {
    super();
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.log.push("unité:ouverte");
    const result = await work();
    this.log.push("unité:validée");
    return result;
  }
}

class LoggedJournal extends RecordingMediaJournal {
  constructor(private readonly log: Log) {
    super();
  }
  override record(entry: MediaJournalEntry): Promise<void> {
    this.log.push("journal");
    return super.record(entry);
  }
}

class LoggedDurable extends RecordingDurable {
  constructor(private readonly log: Log) {
    super();
  }
  override publish(...args: Parameters<RecordingDurable["publish"]>): Promise<void> {
    this.log.push("boîte d'envoi");
    return super.publish(...args);
  }
}

/** Les porteurs : ceux qu'ils nomment, ce qu'ils repointent — ou une panne. */
class StubCarriers extends MediaCarriers {
  readonly replacements: ImageReplacement[] = [];
  constructor(
    private readonly log: Log,
    private readonly named: readonly Carrier[],
    private readonly broken = false,
  ) {
    super();
  }
  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }
  carriersOf(url: string): Promise<readonly Carrier[]> {
    return Promise.resolve(url === A ? this.named : []);
  }
  repoint(replacement: ImageReplacement, ticket: WriteTicket): Promise<number> {
    void ticket;
    this.log.push("porteurs");
    if (this.broken) {
      return Promise.reject(new Error("vitrine injoignable"));
    }
    this.replacements.push(replacement);
    return Promise.resolve(this.named.length);
  }
}

class Library extends MediaLibraryReader {
  constructor(private readonly urls: readonly string[]) {
    super();
  }
  page(): Promise<LibraryMediaPage> {
    return Promise.resolve({ items: [], total: 0, next: null });
  }
  find(url: string): Promise<LibraryMediaRecord | null> {
    return Promise.resolve(this.urls.includes(url) ? record(url) : null);
  }
}

class GestureIds extends UuidGenerator {
  next(): string {
    return "geste_1";
  }
}

function record(url: string): LibraryMediaRecord {
  return {
    url,
    name: url === A ? "Croissant" : "",
    tags: [],
    alt: { fr: "" },
    storageKey: null,
    contentType: "image/jpeg",
    width: 800,
    height: 600,
    bytes: 1,
    focal: null,
    uses: 0,
    depositedAt: AT,
    series: null,
  };
}

const TWO_CARRIERS: readonly Carrier[] = [
  { kind: "product", id: "prd_1", label: "Croissant" },
  { kind: "storefront", id: "home", label: "Accueil — porte" },
];

function setup(options: { named?: readonly Carrier[]; broken?: boolean; inLibrary?: string[] }) {
  const log: Log = [];
  const journal = new LoggedJournal(log);
  const durable = new LoggedDurable(log);
  const carriers = new StubCarriers(log, options.named ?? TWO_CARRIERS, options.broken);
  const handler = new ReplaceMediaHandler(
    new Library(options.inLibrary ?? [A, B]),
    carriers,
    journal,
    new LoggedUnitOfWork(log),
    durable,
    new GestureIds(),
    new FixedClock(AT),
  );
  return { handler, log, journal, durable, carriers };
}

describe("ReplaceMediaHandler", () => {
  it("trace, repointe puis réannonce la NOUVELLE image, dans une seule unité", async () => {
    const { handler, log, journal, durable, carriers } = setup({});

    await handler.execute(new ReplaceMediaCommand(` ${A}`, B, STAFF));

    expect(log).toEqual(["unité:ouverte", "journal", "porteurs", "boîte d'envoi", "unité:validée"]);
    expect(journal.entries).toEqual([
      {
        type: MEDIA_EVENTS.mediaReplaced,
        subjectType: "media_asset",
        subjectId: A,
        payload: { subjectLabel: "Croissant", to: B, carriers: 2 },
      },
    ]);
    expect(carriers.replacements).toEqual([{ from: A, to: B, staffId: STAFF, at: AT }]);
    expect(durable.facts).toEqual([
      {
        type: MEDIA_ASSET_DESCRIBED,
        key: `${MEDIA_ASSET_DESCRIBED}:geste_1`,
        payload: { url: B, gestureId: "geste_1" },
      },
    ]);
  });

  it("trace un remplacement sans porteur, et n'annonce rien", async () => {
    const { handler, journal, durable } = setup({ named: [] });

    await handler.execute(new ReplaceMediaCommand(A, B, STAFF));

    expect(journal.entries[0]?.payload).toMatchObject({ carriers: 0 });
    expect(durable.facts).toEqual([]);
  });

  it("refuse en 404 une ancienne image absente du fonds, sans rien écrire", async () => {
    const { handler, log } = setup({ inLibrary: [B] });

    await expect(handler.execute(new ReplaceMediaCommand(A, B, STAFF))).rejects.toThrow(
      MediaNotInLibraryError,
    );
    expect(log).toEqual([]);
  });

  it("refuse en 404 une nouvelle image absente du fonds, sans rien écrire", async () => {
    const { handler, log } = setup({ inLibrary: [A] });

    await expect(handler.execute(new ReplaceMediaCommand(A, B, STAFF))).rejects.toThrow(
      MediaNotInLibraryError,
    );
    expect(log).toEqual([]);
  });

  it("refuse en 400 de remplacer une image par elle-même, ou par rien", async () => {
    const { handler, log } = setup({});

    await expect(handler.execute(new ReplaceMediaCommand(A, A, STAFF))).rejects.toThrow(
      MediaReplacedBySelfError,
    );
    await expect(handler.execute(new ReplaceMediaCommand(A, " ", STAFF))).rejects.toThrow(
      MediaReplacementUrlRequiredError,
    );
    expect(log).toEqual([]);
  });

  it("laisse tomber l'unité quand un porteur échoue — rien n'est annoncé", async () => {
    const { handler, log, durable } = setup({ broken: true });

    await expect(handler.execute(new ReplaceMediaCommand(A, B, STAFF))).rejects.toThrow(
      "vitrine injoignable",
    );
    expect(log).toEqual(["unité:ouverte", "journal", "porteurs"]);
    expect(durable.facts).toEqual([]);
  });
});
