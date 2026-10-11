import { ImageCatalogue, type CatalogueFocal, type CatalogueImage } from "../image-catalogue.js";

/**
 * Un fonds tenu en table, pour les suites qui ne lisent d'une image que son
 * point focal (L10 du plan de la médiathèque). Une URL absente de la table est
 * absente du fonds ; `null` : présente, sans point posé. Compte ses lectures.
 */
export class FocalImageCatalogue extends ImageCatalogue {
  reads = 0;

  constructor(private readonly focals: ReadonlyMap<string, CatalogueFocal | null> = new Map()) {
    super();
  }

  describe(urls: readonly string[]): Promise<ReadonlyMap<string, CatalogueImage>> {
    this.reads += 1;
    const described = new Map<string, CatalogueImage>();
    for (const url of urls) {
      const focal = this.focals.get(url);
      if (focal !== undefined) {
        described.set(url, imageOf(url, focal));
      }
    }
    return Promise.resolve(described);
  }

  has(url: string): Promise<boolean> {
    return Promise.resolve(this.focals.has(url));
  }
}

function imageOf(url: string, focal: CatalogueFocal | null): CatalogueImage {
  return {
    url,
    name: "",
    alt: { fr: "" },
    width: null,
    height: null,
    bytes: null,
    contentType: null,
    focal,
  };
}
