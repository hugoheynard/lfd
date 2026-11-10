import type { ShopCopyAdminView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopCopyAdminReader } from "../../domain/ports/shop-copy-admin.reader.js";
import { ShopCopyManifest } from "../../domain/shop-copy-manifest.js";
import { shopCopyAdminView } from "../shop-copy-admin-view.js";
import { GetShopCopyAdminQuery } from "./get-shop-copy-admin.query.js";

/** Sert l'écran d'édition. Lecture pure : l'assemblage est une fonction. */
@QueryHandler(GetShopCopyAdminQuery)
export class GetShopCopyAdminHandler implements IQueryHandler<
  GetShopCopyAdminQuery,
  ShopCopyAdminView
> {
  constructor(
    private readonly reader: ShopCopyAdminReader,
    private readonly manifest: ShopCopyManifest,
  ) {}

  async execute(): Promise<ShopCopyAdminView> {
    const [entries, publication] = await Promise.all([
      this.reader.entries(),
      this.reader.publication(),
    ]);
    return shopCopyAdminView(this.manifest, entries, publication);
  }
}
