import type { ShopCopyLocale } from "../../domain/shop-copy-locale.js";

/** Command : revenir au texte du code au prochain « Publier ». */
export class ResetShopCopyDraftCommand {
  constructor(
    readonly key: string,
    readonly locale: ShopCopyLocale,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
