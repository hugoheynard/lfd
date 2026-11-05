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
import { SHELF_STORE_LIMIT_MS, ShelfCallGuard } from "./shelf-call-guard.js";

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

  /**
   * Présente un rayon au rangement ; un refus ou une panne ne fait que se
   * compter. Le délai est celui d'un rangement ({@link SHELF_STORE_LIMIT_MS}) :
   * personne ne l'attend depuis le 2026-11-05 ({@link storeAfterReply}).
   */
  async store(entry: ShelfToStore): Promise<void> {
    const outcome = await this.guard.call(
      "store",
      () => this.cache.store(entry),
      true,
      SHELF_STORE_LIMIT_MS,
    );
    if (outcome !== null) {
      this.signals.emit({ name: outcome === "stale" ? "stale_refused" : outcome });
    }
  }

  /**
   * **Range sans faire attendre la réponse** (C5, 2026-11-05 : en production,
   * un rayon de ~145 Ko dépassait les 100 ms du repli, et le rangement attendu
   * retardait la vue). Non attendu, et c'est le but : `void` sur le précédent
   * du journal des transitions (`ops/health/ops-health.service.ts`, vérifié le
   * 2026-11-05). Rien n'est avalé : {@link store} ne lève jamais — garde,
   * signaux et minuteurs ne lèvent pas par contrat — et toute panne y est
   * comptée `fallback` (`operation: store`), que les signaux journalisent.
   */
  storeAfterReply(entry: ShelfToStore): void {
    void this.store(entry);
  }

  /**
   * Efface des rayons ; une panne est comptée, et rattrapée par la seule durée
   * de vie — 5 minutes au plus depuis le 2026-11-04 (30 s avant ;
   * `plan-rayon-jusqu-a-la-prochaine-heure.md`, § 0, objection 3, et § 2 (c)
   * qui la ferme avant tout plafond plus long).
   */
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
