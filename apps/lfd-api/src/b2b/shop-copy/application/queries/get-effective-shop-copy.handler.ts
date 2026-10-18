import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PublishedShopCopyReader } from "../../domain/ports/published-shop-copy.reader.js";
import { ShopCopyManifest } from "../../domain/shop-copy-manifest.js";
import { GetEffectiveShopCopyQuery } from "./get-effective-shop-copy.query.js";

/**
 * Le texte que la boutique AFFICHE, clé par clé : la boutique applique les
 * remplacements publiés par-dessus ses dictionnaires ; ce handler fait la même
 * chose avec la copie du manifeste que l'API embarque (`pnpm copy:digest`,
 * tenue identique par `lint:shop-copy-digest`). Les orphelines n'en sortent
 * pas : seules les clés du manifeste sont lues.
 */
@QueryHandler(GetEffectiveShopCopyQuery)
export class GetEffectiveShopCopyHandler implements IQueryHandler<
  GetEffectiveShopCopyQuery,
  Readonly<Record<string, string>>
> {
  constructor(
    private readonly published: PublishedShopCopyReader,
    private readonly manifest: ShopCopyManifest,
  ) {}

  async execute(query: GetEffectiveShopCopyQuery): Promise<Readonly<Record<string, string>>> {
    const { texts } = await this.published.read(query.locale);
    return Object.fromEntries(
      this.manifest
        .entries()
        .map((entry) => [entry.key, texts[entry.key] ?? entry.originals[query.locale]]),
    );
  }
}
