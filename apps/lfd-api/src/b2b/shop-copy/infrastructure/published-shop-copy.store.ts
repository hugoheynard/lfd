import type { ShopCopyLocale } from "../domain/shop-copy-locale.js";

/**
 * Les deux lectures que le cache des textes publiés fait en base — séparées
 * parce qu'elles n'ont pas le même prix : la version est UNE petite ligne,
 * relue souvent ; les textes d'une langue ne se relisent que quand la version
 * a bougé. Interne à l'infrastructure : seul le cache en dépend.
 */
export abstract class PublishedShopCopyStore {
  abstract version(): Promise<number>;
  abstract texts(locale: ShopCopyLocale): Promise<Readonly<Record<string, string>>>;
}
