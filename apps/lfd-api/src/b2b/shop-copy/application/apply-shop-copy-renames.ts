import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PublishedShopCopyCache } from "../domain/ports/published-shop-copy.reader.js";
import { ShopCopyRenamer } from "../domain/ports/shop-copy-renamer.js";

/**
 * **Reporter les renommages de clés** (§10) — dans l'ordre du fichier, en une
 * transaction, puis oublier le cache de lecture si une ligne a bougé.
 *
 * Pas un `@CommandHandler` : personne ne le demande, c'est le démarrage qui le
 * déclenche, et il ne change pas ce que la boutique affiche — il garde un
 * remplacement attaché au texte qu'il remplaçait déjà.
 */
@Injectable()
export class ApplyShopCopyRenames {
  constructor(
    private readonly renamer: ShopCopyRenamer,
    private readonly cache: PublishedShopCopyCache,
    private readonly uow: UnitOfWork,
  ) {}

  /** Rend le nombre de lignes déplacées. */
  async apply(renames: readonly (readonly [string, string])[]): Promise<number> {
    if (renames.length === 0) {
      return 0;
    }
    const moved = await this.uow.run(async () => {
      let total = 0;
      for (const [from, to] of renames) {
        total += await this.renamer.relocate(from, to);
      }
      return total;
    });
    if (moved > 0) {
      this.cache.forget();
    }
    return moved;
  }
}
