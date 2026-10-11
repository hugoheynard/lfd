import { ReadMediaImageHandler, ReadMediaImageQuery } from "../read-media-image.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../../domain/ports/media-library-reader.js";
import { MediaNotInLibraryError } from "../../domain/value-objects/image.js";

const IMAGE = "https://media.test/products/abc.png";

const RECORD: LibraryMediaRecord = {
  url: IMAGE,
  name: "Croissant",
  tags: ["four"],
  alt: { fr: "Un croissant" },
  storageKey: "products/abc.png",
  contentType: "image/png",
  width: 10,
  height: 10,
  bytes: 24,
  focal: null,
  uses: 1,
  depositedAt: new Date(0),
  series: null,
  palette: null,
};

/** Un lecteur qui ne connaît qu'une image et retient l'URL demandée. */
class OneImageReader extends MediaLibraryReader {
  asked: string | null = null;

  page(): Promise<LibraryMediaPage> {
    return Promise.reject(new Error("le fil n'a pas à être lu"));
  }

  find(url: string): Promise<LibraryMediaRecord | null> {
    this.asked = url;
    return Promise.resolve(url === IMAGE ? RECORD : null);
  }
}

describe("ReadMediaImage", () => {
  it("rend l'image, URL rognée", async () => {
    const reader = new OneImageReader();
    const found = await new ReadMediaImageHandler(reader).execute(
      new ReadMediaImageQuery(`  ${IMAGE} `),
    );
    expect(found).toBe(RECORD);
    expect(reader.asked).toBe(IMAGE);
  });

  it("refuse une URL inconnue", async () => {
    await expect(
      new ReadMediaImageHandler(new OneImageReader()).execute(new ReadMediaImageQuery("x")),
    ).rejects.toBeInstanceOf(MediaNotInLibraryError);
  });

  it("refuse une URL vide sans interroger le lecteur", async () => {
    const reader = new OneImageReader();
    await expect(
      new ReadMediaImageHandler(reader).execute(new ReadMediaImageQuery(" ")),
    ).rejects.toBeInstanceOf(MediaNotInLibraryError);
    expect(reader.asked).toBeNull();
  });
});
