import type { LibraryFilter } from "../../domain/ports/media-library-reader.js";
import { MediaPaletteStripReader } from "../../domain/ports/media-palette-strip-reader.js";
import type { StripImage } from "../../domain/services/palette-strip.js";
import { InvalidDepositPeriodError } from "../library-period.js";
import { ReadPaletteStripHandler, ReadPaletteStripQuery } from "../read-palette-strip.js";

const DAY = 86_400_000;
const ORIGIN = 1_700_000_000_000;

class FakeStripReader extends MediaPaletteStripReader {
  readonly filters: LibraryFilter[] = [];
  constructor(private readonly images: readonly StripImage[]) {
    super();
  }
  chronicle(filter: LibraryFilter): Promise<readonly StripImage[]> {
    this.filters.push(filter);
    return Promise.resolve(this.images);
  }
}

const images = (count: number): StripImage[] =>
  Array.from({ length: count }, (_, rank) => ({
    url: `u${String(rank)}`,
    takenAt: new Date(ORIGIN + rank * DAY),
    palette: rank % 2 === 0 ? [{ hex: "#336699", share: 1, outlier: false }] : null,
  }));

describe("ReadPaletteStripHandler", () => {
  it("transmet les filtres du feed, période traduite en instants", async () => {
    const reader = new FakeStripReader([]);
    await new ReadPaletteStripHandler(reader).execute(
      new ReadPaletteStripQuery({
        q: "pain",
        tags: ["levain"],
        series: "s1",
        from: "2026-03-01",
        to: "2026-03-02",
        untagged: true,
        unused: true,
      }),
    );
    expect(reader.filters).toEqual([
      {
        q: "pain",
        tags: ["levain"],
        seriesId: "s1",
        depositedFrom: expect.any(Date) as Date,
        depositedBefore: expect.any(Date) as Date,
        untagged: true,
        unused: true,
      },
    ]);
  });

  it("transmet la période de prise de vue telle que le feed la lit (L11)", async () => {
    const reader = new FakeStripReader([]);
    await new ReadPaletteStripHandler(reader).execute(
      new ReadPaletteStripQuery({ shotFrom: "2026-03-01", shotTo: "2026-03-02" }),
    );
    expect(reader.filters).toEqual([{ takenFrom: "2026-03-01", takenTo: "2026-03-02" }]);
  });

  it("refuse une période de prise de vue à l'envers, sans lire le fonds", async () => {
    const reader = new FakeStripReader([]);
    await expect(
      new ReadPaletteStripHandler(reader).execute(
        new ReadPaletteStripQuery({ shotFrom: "2026-03-05", shotTo: "2026-03-01" }),
      ),
    ).rejects.toThrow(/prise de vue/);
    expect(reader.filters).toEqual([]);
  });

  it("n'envoie aucun filtre quand rien n'est demandé", async () => {
    const reader = new FakeStripReader([]);
    await new ReadPaletteStripHandler(reader).execute(new ReadPaletteStripQuery());
    expect(reader.filters).toEqual([{}]);
  });

  it("rend les colonnes en ISO, le total et les non peintes", async () => {
    const view = await new ReadPaletteStripHandler(new FakeStripReader(images(4))).execute(
      new ReadPaletteStripQuery({ columns: 2 }),
    );
    expect(view.total).toBe(4);
    expect(view.unpainted).toBe(2);
    expect(view.columns).toEqual([
      {
        from: new Date(ORIGIN).toISOString(),
        to: new Date(ORIGIN + DAY).toISOString(),
        count: 2,
        palette: [{ hex: "#336699", share: 1, outlier: false }],
        sampleUrl: "u0",
      },
      expect.objectContaining({ count: 2, sampleUrl: "u2" }) as object,
    ]);
  });

  it("borne les colonnes à 400, et à 120 par défaut", async () => {
    const reader = new FakeStripReader(images(500));
    const handler = new ReadPaletteStripHandler(reader);
    expect(
      (await handler.execute(new ReadPaletteStripQuery({ columns: 9999 }))).columns,
    ).toHaveLength(400);
    expect((await handler.execute(new ReadPaletteStripQuery())).columns).toHaveLength(120);
  });

  it("refuse une période à l'envers, sans lire le fonds", async () => {
    const reader = new FakeStripReader([]);
    await expect(
      new ReadPaletteStripHandler(reader).execute(
        new ReadPaletteStripQuery({ from: "2026-03-05", to: "2026-03-01" }),
      ),
    ).rejects.toBeInstanceOf(InvalidDepositPeriodError);
    expect(reader.filters).toEqual([]);
  });
});
