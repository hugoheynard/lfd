import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import {
  StorefrontImageRepointing,
  type StorefrontImageChange,
} from "../channels/media/storefront-image-repointing.js";
import { StorefrontRepository } from "../domain/storefront.repository.js";

/**
 * La vitrine répond au remplacement d'une image : charger, repointer par
 * l'agrégat, enregistrer — sous le même verrou de révision qu'un
 * enregistrement de l'éditeur.
 *
 * ⚠️ Pas de `storefront.saved` : le fait du geste est `media_asset.replaced`,
 * tracé par la médiathèque avant d'appeler (le laissez-passer en témoigne).
 */
@Injectable()
export class RepointStorefrontImage extends StorefrontImageRepointing {
  constructor(private readonly storefronts: StorefrontRepository) {
    super();
  }

  async repoint(change: StorefrontImageChange, ticket: WriteTicket): Promise<number> {
    void ticket;
    const storefront = await this.storefronts.load();
    const carriers = storefront.repointImage(change.from, change.to, {
      at: change.at,
      staffId: change.staffId,
    });
    if (carriers > 0) {
      await this.storefronts.save(storefront);
    }
    return carriers;
  }
}
