import type { PublishedShopCopyView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PublishedShopCopyReader } from "../../domain/ports/published-shop-copy.reader.js";
import { ShopCopyManifest } from "../../domain/shop-copy-manifest.js";
import { GetPublishedShopCopyQuery } from "./get-published-shop-copy.query.js";

/**
 * Sert ce que la boutique applique. Les orphelines n'en sortent pas : la
 * boutique les ignorerait de toute façon, et une réponse publique ne porte que
 * ce qui sert.
 */
@QueryHandler(GetPublishedShopCopyQuery)
export class GetPublishedShopCopyHandler implements IQueryHandler<
  GetPublishedShopCopyQuery,
  PublishedShopCopyView
> {
  constructor(
    private readonly published: PublishedShopCopyReader,
    private readonly manifest: ShopCopyManifest,
  ) {}

  async execute(query: GetPublishedShopCopyQuery): Promise<PublishedShopCopyView> {
    const { version, texts } = await this.published.read(query.locale);
    const served = Object.entries(texts).filter(([key]) => this.manifest.knows(key));
    return { locale: query.locale, version, texts: Object.fromEntries(served) };
  }
}
