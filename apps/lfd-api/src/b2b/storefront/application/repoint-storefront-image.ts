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

  /**
   * `_ticket` n'est pas lu, et c'est son rôle : il PROUVE que l'appelant a
   * tracé `media_asset.replaced` avant d'écrire ici. Le port l'exige pour que
   * `lint:journal-tracked` refuse un appelant qui ne journalise pas ; la
   * vitrine n'a rien à y inscrire (même forme que les dépôts de
   * `pim/operations/`, vérifié le 2026-10-11).
   */
  async repoint(change: StorefrontImageChange, _ticket: WriteTicket): Promise<number> {
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
