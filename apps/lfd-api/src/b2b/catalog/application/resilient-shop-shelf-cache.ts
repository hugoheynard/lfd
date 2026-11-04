import { Injectable } from "@nestjs/common";

import type { ShelfPurgeOrder } from "../../shared/shelf-changes/domain/shelf-purge-batch.js";
import { ShelfCacheSignals } from "../domain/ports/shelf-cache-signals.js";
import {
  ShopShelfCache,
  type ShelfKey,
  type ShelfLookup,
  type ShelfToStore,
} from "../domain/ports/shop-shelf-cache.js";
import { ShopShelfEraser } from "../domain/ports/shop-shelf-eraser.js";
import { ShelfCallGuard } from "./shelf-call-guard.js";

/**
 * **Le cache n'est jamais sur le chemin de la disponibilité** (Hugo,
 * 2026-11-04 : « la prod ne peut jamais tomber en panne », § 4 bis).
 *
 * Toute lecture ou tout rangement passe ici : délai court, disjoncteur
 * ({@link ShelfCallGuard}, partagé avec le rayon public), et toute erreur,
 * lenteur ou réponse illisible devient `null` — « calcule depuis la base,
 * sers, ne range rien ». Rien de ce qui sort d'ici ne lève.
 *
 * L'effacement passe aussi par le délai, mais **pas** par le disjoncteur :
 * une purge est rare (au plus une par seconde) et c'est la seule chose qui
 * rattrape un rayon devenu faux — la tenter coûte moins que la sauter.
 */
@Injectable()
export class ResilientShopShelfCache {
  constructor(
    private readonly cache: ShopShelfCache,
    private readonly eraser: ShopShelfEraser,
    private readonly guard: ShelfCallGuard,
    private readonly signals: ShelfCacheSignals,
  ) {}

  /** Le rayon rangé, un raté avec la version, ou `null` : magasin indisponible. */
  async read(key: ShelfKey, now: Date): Promise<ShelfLookup | null> {
    const lookup = await this.guard.call("read", () => this.cache.read(key, now), true);
    if (lookup !== null) {
      this.signals.emit({ name: lookup.kind });
    }
    return lookup;
  }

  /** Présente un rayon au rangement ; un refus ou une panne ne fait que se compter. */
  async store(entry: ShelfToStore): Promise<void> {
    const outcome = await this.guard.call("store", () => this.cache.store(entry), true);
    if (outcome !== null) {
      this.signals.emit({ name: outcome === "stale" ? "stale_refused" : outcome });
    }
  }

  /** Efface des rayons ; une panne est comptée, la durée de vie de 30 s rattrape. */
  async erase(order: ShelfPurgeOrder): Promise<void> {
    const done = await this.guard.call(
      "erase",
      () => this.eraser.erase(order).then(() => true),
      false,
    );
    if (done !== null) {
      this.signals.emit({
        name: "erased",
        scope: order.kind,
        companies: order.kind === "companies" ? order.companyIds.length : 0,
      });
    }
  }
}
