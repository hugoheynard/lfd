import { ImageCatalogue, type CatalogueImage } from "../../pim/channels/media/image-catalogue.js";
import { MediaOperationImageLibrary } from "../media-operation-image-library.js";

const IMAGE = "https://media.test/buche.webp";

class StubCatalogue extends ImageCatalogue {
  constructor(private readonly images: readonly CatalogueImage[]) {
    super();
  }

  describe(urls: readonly string[]): Promise<ReadonlyMap<string, CatalogueImage>> {
    return Promise.resolve(
      new Map(this.images.filter((image) => urls.includes(image.url)).map((i) => [i.url, i])),
    );
  }

  has(url: string): Promise<boolean> {
    return Promise.resolve(this.images.some((image) => image.url === url));
  }
}

describe("MediaOperationImageLibrary", () => {
  it("décrit une image du fonds : adresse, description française, dimensions, point focal", async () => {
    const library = new MediaOperationImageLibrary(
      new StubCatalogue([
        {
          url: IMAGE,
          name: "bûche",
          alt: { fr: "Une bûche", en: "A yule log" },
          width: 1200,
          height: 800,
          bytes: 1000,
          contentType: "image/webp",
          focal: { x: 0.4, y: 0.6 },
        },
      ]),
    );

    expect(await library.describe(IMAGE)).toEqual({
      url: IMAGE,
      alt: "Une bûche",
      width: 1200,
      height: 800,
      focal: { x: 0.4, y: 0.6 },
    });
  });

  it("rend null pour une image que le fonds ne connaît pas", async () => {
    expect(await new MediaOperationImageLibrary(new StubCatalogue([])).describe(IMAGE)).toBeNull();
  });
});
