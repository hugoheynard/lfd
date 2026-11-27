import type { WishlistItemView } from "@lfd/contracts";

/** Port de **lecture** de la liste d'envies d'une personne dans une société. */
export abstract class WishlistReader {
  /** Les articles, du plus récent au plus ancien. */
  abstract itemsOf(userId: string, companyId: string): Promise<readonly WishlistItemView[]>;
}
