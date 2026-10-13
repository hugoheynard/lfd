import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import type { RegisteredMedia } from "../../domain/ports/media-library.js";
import { MediaNotInLibraryError } from "../../domain/value-objects/image.js";
import { InvalidImagePaletteError } from "../../domain/value-objects/image-palette.js";
import { DepositImageCommand, DepositImageHandler } from "../deposit-image.js";
import { DepositPalette } from "../deposit-palette.js";
import { DepositRefusals } from "../deposit-refusals.js";
import { PaintMediaPaletteCommand, PaintMediaPaletteHandler } from "../paint-media-palette.js";
import {
  FakeLibrary,
  FakeSeries,
  DEPOSITED_HASH,
  FakeStore,
  png,
  RecordingFailures,
  RecordingPalettes,
} from "./deposit-image-doubles.js";

const URL = `https://media.example/images/${DEPOSITED_HASH}.png`;
const PALETTE = [
  { hex: "#AA3300", share: 0.7, outlier: false },
  { hex: "#ffeedd", share: 0.3, outlier: false },
  { hex: "#0044ff", share: 0.02, outlier: true },
];
const STORED = [
  { hex: "#aa3300", share: 0.7, outlier: false },
  { hex: "#ffeedd", share: 0.3, outlier: false },
  { hex: "#0044ff", share: 0.02, outlier: true },
];

function depositHandler(
  library: FakeLibrary,
  palettes: RecordingPalettes,
  store = new FakeStore(),
) {
  return new DepositImageHandler(
    store,
    library,
    new FakeSeries(),
    new RecordingMediaJournal(),
    new DepositRefusals(new RecordingFailures()),
    new DirectUnitOfWork(),
    new DepositPalette(palettes, new RecordingMediaJournal()),
  );
}

describe("la palette au dépôt", () => {
  it("pose la palette revalidée d'une image neuve", async () => {
    const palettes = new RecordingPalettes();
    await depositHandler(new FakeLibrary(), palettes).execute(
      new DepositImageCommand(png(400, 400), "", null, PALETTE),
    );
    expect(palettes.painted.get(URL)).toEqual(STORED);
  });

  it("sans palette, n'écrit rien : elle se rattrapera", async () => {
    const palettes = new RecordingPalettes();
    await depositHandler(new FakeLibrary(), palettes).execute(
      new DepositImageCommand(png(400, 400)),
    );
    expect(palettes.calls).toEqual([]);
  });

  it("pose la palette d'une image déjà au fonds qui n'en avait pas", async () => {
    const origin: RegisteredMedia = {
      id: "media_0",
      url: URL,
      storageKey: `images/${DEPOSITED_HASH}.png`,
      contentType: "image/png",
      width: 400,
      height: 400,
      bytes: 24,
      seriesId: null,
    };
    const library = new FakeLibrary([origin]);
    const palettes = new RecordingPalettes();
    const result = await depositHandler(library, palettes).execute(
      new DepositImageCommand(png(400, 400), "", null, PALETTE),
    );
    expect(result.alreadyInLibrary).toBe(true);
    expect(library.registered).toEqual([]);
    expect(palettes.painted.get(URL)).toEqual(STORED);
  });

  it("refuse une palette invalide AVANT de ranger les octets", async () => {
    const store = new FakeStore();
    const library = new FakeLibrary();
    await expect(
      depositHandler(library, new RecordingPalettes(), store).execute(
        new DepositImageCommand(png(400, 400), "", null, [
          { hex: "#aaaaaa", share: 0.4, outlier: false },
        ]),
      ),
    ).rejects.toThrow(InvalidImagePaletteError);
    expect(store.puts).toEqual([]);
    expect(library.registered).toEqual([]);
  });
});

describe("PaintMediaPaletteHandler", () => {
  function handler(palettes: RecordingPalettes, journal = new RecordingMediaJournal()) {
    return new PaintMediaPaletteHandler(palettes, journal, new DirectUnitOfWork());
  }

  it("pose la palette, sans fait au journal", async () => {
    const palettes = new RecordingPalettes([URL]);
    const journal = new RecordingMediaJournal();
    await handler(palettes, journal).execute(new PaintMediaPaletteCommand(` ${URL} `, PALETTE));
    expect(palettes.painted.get(URL)).toEqual(STORED);
    expect(journal.entries).toEqual([]);
  });

  it("n'écrase pas une palette déjà posée, et réussit quand même", async () => {
    const palettes = new RecordingPalettes([URL]);
    await handler(palettes).execute(new PaintMediaPaletteCommand(URL, PALETTE));
    const other = [{ hex: "#000000", share: 1, outlier: false }];
    await handler(palettes).execute(new PaintMediaPaletteCommand(URL, other));
    expect(palettes.painted.get(URL)).toEqual(STORED);
  });

  it("refuse en 404 une image absente du fonds", async () => {
    const palettes = new RecordingPalettes([URL]);
    await expect(
      handler(palettes).execute(new PaintMediaPaletteCommand("https://ailleurs/x.png", PALETTE)),
    ).rejects.toThrow(MediaNotInLibraryError);
  });

  it("refuse une palette invalide sans rien écrire", async () => {
    const palettes = new RecordingPalettes([URL]);
    await expect(
      handler(palettes).execute(
        new PaintMediaPaletteCommand(URL, [{ hex: "#zzzzzz", share: 1, outlier: false }]),
      ),
    ).rejects.toThrow(InvalidImagePaletteError);
    expect(palettes.calls).toEqual([]);
  });
});
