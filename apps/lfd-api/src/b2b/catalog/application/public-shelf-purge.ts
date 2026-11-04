import { Injectable } from "@nestjs/common";

import {
  ShelfPurge,
  type ShelfPurgeRequest,
} from "../../shared/shelf-changes/domain/ports/shelf-purge.js";
import { ShelfCacheSignals } from "../domain/ports/shelf-cache-signals.js";
import { orderTouchesPublicShelf } from "../domain/public-shelf-rules.js";
import { ResilientPublicShelf } from "./resilient-public-shelf.js";

/**
 * **La purge du rayon public** (C3, `plan-cache-du-catalogue.md` § 5) : un
 * magasin de plus dans l'éventail (`FanOutShelfPurge`). Seule une purge
 * « tout » le touche ({@link orderTouchesPublicShelf}).
 *
 * Drapeau éteint : aucune réponse publique n'a pu se garder depuis
 * l'extinction (`public-off` et `off` purgent eux-mêmes), donc rien à purger —
 * et l'offre gratuite limite les purges. État illisible : on purge quand
 * même, dans le doute.
 *
 * Ne lève pas ; une purge perdue, la durée de 30 s la rattrape.
 */
@Injectable()
export class PublicShelfPurge extends ShelfPurge {
  constructor(
    private readonly shelf: ResilientPublicShelf,
    private readonly signals: ShelfCacheSignals,
  ) {
    super();
  }

  async purge(request: ShelfPurgeRequest): Promise<void> {
    if (!orderTouchesPublicShelf(request.order)) {
      return;
    }
    const state = await this.shelf.state();
    if (state !== null && !state.enabled) {
      this.signals.emit({ name: "public_purge_skipped" });
      return;
    }
    await this.shelf.purge();
  }
}
