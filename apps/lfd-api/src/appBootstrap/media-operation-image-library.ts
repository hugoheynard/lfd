import { Injectable } from "@nestjs/common";

import {
  OperationImageLibrary,
  type LibraryImage,
} from "../b2b/operations/channels/media/operation-image-library.js";
import { ImageCatalogue } from "../pim/channels/media/image-catalogue.js";

/**
 * **Ce que la médiathèque répond aux opérations du commerce** : « décris-moi
 * cette image » (plan `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O3, lot 2).
 *
 * 🔴 Ici, dans `appBootstrap/`, pour la raison de `StorefrontMediaCarriers` :
 * la ligne `b2b` de la matrice n'a pas `media`. Il relit le fonds par le port
 * de lecture que la médiathèque sert déjà au référentiel (`ImageCatalogue`,
 * lié à son adaptateur par `ImageCatalogueModule`), comme
 * `RefocusStorefrontOnMediaDescribed` : une seule lecture du fonds, deux
 * vocabulaires traduits ici.
 */
@Injectable()
export class MediaOperationImageLibrary extends OperationImageLibrary {
  constructor(private readonly images: ImageCatalogue) {
    super();
  }

  async describe(url: string): Promise<LibraryImage | null> {
    return (await this.describeMany([url])).get(url) ?? null;
  }

  async describeMany(urls: readonly string[]): Promise<ReadonlyMap<string, LibraryImage>> {
    const described = new Map<string, LibraryImage>();
    if (urls.length === 0) {
      return described;
    }
    for (const image of (await this.images.describe([...new Set(urls)])).values()) {
      described.set(image.url, {
        url: image.url,
        alt: image.alt.fr,
        width: image.width,
        height: image.height,
        focal: image.focal,
      });
    }
    return described;
  }
}
