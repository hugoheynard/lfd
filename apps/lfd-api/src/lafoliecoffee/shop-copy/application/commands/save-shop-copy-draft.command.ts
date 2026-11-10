import type { ShopCopyLocale } from "../../domain/shop-copy-locale.js";

/** Command : écrire le brouillon d'un texte, sur la révision que l'écran a lue. */
export class SaveShopCopyDraftCommand {
  constructor(
    readonly key: string,
    readonly locale: ShopCopyLocale,
    readonly text: string,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
