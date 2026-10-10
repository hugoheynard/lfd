import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import { MediaTagReader, MediaTagWriter } from "../../domain/ports/media-tags.js";
import {
  MediaTagNotFoundError,
  MediaTagUnchangedError,
  tagVocabulary,
  type TagCount,
  type TaggedImage,
} from "../../domain/value-objects/tag-vocabulary.js";
import { ListMediaTagsHandler } from "../list-media-tags.js";
import { RemoveMediaTagCommand, RemoveMediaTagHandler } from "../remove-media-tag.js";
import { RenameMediaTagCommand, RenameMediaTagHandler } from "../rename-media-tag.js";

/** Un fonds en mémoire : il rend les images qui portent le mot demandé. */
class InMemoryTags extends MediaTagReader {
  asked: string | null = null;

  constructor(private readonly images: readonly TaggedImage[]) {
    super();
  }

  vocabulary(): Promise<readonly TagCount[]> {
    return Promise.resolve(tagVocabulary(this.images.map((image) => image.tags)));
  }

  imagesTagged(tag: string): Promise<readonly TaggedImage[]> {
    this.asked = tag;
    return Promise.resolve(this.images.filter((image) => image.tags.includes(tag)));
  }
}

/** Garde ce qu'on écrit, et si l'écriture a eu lieu DANS l'unité de travail. */
class RecordingWriter extends MediaTagWriter {
  readonly written: (readonly TaggedImage[])[] = [];
  insideUnit = false;

  constructor(private readonly uow: CountingUnitOfWork) {
    super();
  }

  retag(images: readonly TaggedImage[], ticket: WriteTicket): Promise<void> {
    void ticket;
    this.insideUnit = this.uow.open;
    this.written.push(images);
    return Promise.resolve();
  }
}

class CountingUnitOfWork extends UnitOfWork {
  runs = 0;
  open = false;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = false;
    }
  }
}

const A = { url: "https://media.example/a.png", tags: ["croissant", "beurre"] };
const B = { url: "https://media.example/b.png", tags: ["doré", "croissant"] };

function rig(images: readonly TaggedImage[]) {
  const uow = new CountingUnitOfWork();
  const reader = new InMemoryTags(images);
  const writer = new RecordingWriter(uow);
  const journal = new RecordingMediaJournal();
  return {
    uow,
    reader,
    writer,
    journal,
    rename: new RenameMediaTagHandler(reader, writer, journal, uow),
    remove: new RemoveMediaTagHandler(reader, writer, journal, uow),
  };
}

describe("RenameMediaTag", () => {
  it("cherche le mot normalisé, écrit dans UNE unité, et trace un seul fait", async () => {
    const { uow, reader, writer, journal, rename } = rig([A, B]);

    await rename.execute(new RenameMediaTagCommand(" Croissant", "doré"));

    expect(reader.asked).toBe("croissant");
    expect(uow.runs).toBe(1);
    expect(writer.insideUnit).toBe(true);
    expect(writer.written).toEqual([
      [
        { url: A.url, tags: ["doré", "beurre"] },
        { url: B.url, tags: ["doré"] },
      ],
    ]);
    expect(journal.entries).toEqual([
      {
        type: "media_tag.renamed",
        subjectType: "media_tag",
        subjectId: "croissant",
        payload: {
          subjectLabel: "croissant",
          from: "croissant",
          to: "doré",
          images: 2,
          merged: true,
        },
      },
    ]);
  });

  it("n'écrit ni ne trace rien quand le mot ne change pas", async () => {
    const { writer, journal, rename } = rig([A]);

    await expect(
      rename.execute(new RenameMediaTagCommand("croissant", "CROISSANT")),
    ).rejects.toThrow(MediaTagUnchangedError);

    expect(writer.written).toEqual([]);
    expect(journal.entries).toEqual([]);
  });

  it("n'écrit ni ne trace rien quand personne ne porte le mot", async () => {
    const { writer, journal, rename } = rig([A]);

    await expect(rename.execute(new RenameMediaTagCommand("baguette", "brioche"))).rejects.toThrow(
      MediaTagNotFoundError,
    );

    expect(writer.written).toEqual([]);
    expect(journal.entries).toEqual([]);
  });
});

describe("RemoveMediaTag", () => {
  it("retire le mot partout, en un geste et un fait", async () => {
    const { uow, writer, journal, remove } = rig([A, B]);

    await remove.execute(new RemoveMediaTagCommand("croissant"));

    expect(uow.runs).toBe(1);
    expect(writer.written).toEqual([
      [
        { url: A.url, tags: ["beurre"] },
        { url: B.url, tags: ["doré"] },
      ],
    ]);
    expect(journal.types()).toEqual(["media_tag.removed"]);
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "croissant",
      tag: "croissant",
      images: 2,
    });
  });

  it("dit 404 quand personne ne porte le mot, sans rien écrire", async () => {
    const { writer, journal, remove } = rig([A]);

    await expect(remove.execute(new RemoveMediaTagCommand("baguette"))).rejects.toThrow(
      MediaTagNotFoundError,
    );

    expect(writer.written).toEqual([]);
    expect(journal.entries).toEqual([]);
  });
});

describe("ListMediaTags", () => {
  it("rend le vocabulaire du lecteur, dans son ordre", async () => {
    const { reader } = rig([A, B]);

    expect(await new ListMediaTagsHandler(reader).execute()).toEqual([
      { tag: "croissant", count: 2 },
      { tag: "beurre", count: 1 },
      { tag: "doré", count: 1 },
    ]);
  });
});
