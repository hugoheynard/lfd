import { Injectable } from "@nestjs/common";

import {
  ShelfPurge,
  type ShelfPurgeRequest,
} from "../../shared/shelf-changes/domain/ports/shelf-purge.js";
import { ResilientShopShelfCache } from "./resilient-shop-shelf-cache.js";

/**
 * **La purge des rayons pro** (C2) : la fenêtre regroupée efface dans le
 * magasin « tout » ou « ces sociétés et leurs sites », en montant sa version.
 *
 * Ne lève pas : le magasin est joint à travers {@link ResilientShopShelfCache},
 * qui compte la panne ; la durée de vie la rattrape (§ 5) — 5 minutes au plus
 * depuis le 2026-11-04, 30 s avant (`plan-rayon-jusqu-a-la-prochaine-heure.md`).
 */
@Injectable()
export class ProShelfPurge extends ShelfPurge {
  constructor(private readonly cache: ResilientShopShelfCache) {
    super();
  }

  purge(request: ShelfPurgeRequest): Promise<void> {
    return this.cache.erase(request.order);
  }
}
