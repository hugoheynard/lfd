import { Injectable } from "@nestjs/common";

import { BoundedCallGuard } from "../../../platform/cache-calls/bounded-call-guard.js";
import { Stopwatch } from "../../../platform/metrics/stopwatch.js";
import { TimingRecorder } from "../../../platform/metrics/timing-recorder.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import { UnreadableShelfReplyError } from "../domain/errors/unreadable-shelf-reply.error.js";
import { ShelfCallDeadline } from "../domain/ports/shelf-call-deadline.js";
import {
  ShelfCacheSignals,
  type ShelfCacheOperation,
} from "../domain/ports/shelf-cache-signals.js";
import { ShelfCacheBreaker } from "./shelf-cache-breaker.js";

/**
 * Le délai d'une **lecture** au magasin des rayons (et d'un effacement) :
 * 400 ms depuis le 2026-11-05, 100 ms avant (`le-rayon-en-cache.md`,
 * § 4 bis).
 *
 * Mesuré en production le 2026-11-05 (carte de santé, `cacheCalls`) : à
 * 100 ms, deux lectures du rayon reconnu sur trois étaient abandonnées, et
 * l'API recalculait alors le rayon depuis la base — 300 ms à 2 s. Attendre
 * 400 ms coûte donc moins que recalculer. Une lecture qui dépasse reste un
 * repli compté (`timeout`) et nourrit le disjoncteur comme avant.
 *
 * L'effacement garde le même délai : il n'est pas gardé par le disjoncteur
 * (`gated: false`), et à 100 ms on comptait `timeout` des purges qui
 * aboutissaient.
 */
export const SHELF_CALL_LIMIT_MS = 400;

/**
 * Le délai d'un **rangement**, qui part après la réponse (2026-11-05) : aucun
 * client ne l'attend plus, et l'abandonner au délai d'une lecture compterait `timeout` — et
 * nourrirait le disjoncteur — un rangement qui aurait abouti. Il prend donc le
 * filet du socket de l'adaptateur (`SHELF_SOCKET_TIMEOUT_MS`,
 * `durable-object-shop-shelf-cache.ts`, 2000 ms, vérifié le 2026-11-05) : au
 * delà, l'appel est coupé de toute façon.
 */
export const SHELF_STORE_LIMIT_MS = 2000;

/** Le nom du cache des rayons, préfixe de ses mesures. */
const SHELF_CACHE_NAME = "shelf_cache";

/**
 * Le nom de la mesure de durée d'un aller-retour, lu par la carte de santé (C5).
 * Étiquettes : `operation`, et `outcome` — `in_time`, `late` (durée jusqu'à
 * l'abandon) ou `error`.
 */
export const SHELF_ROUND_TRIP_TIMING = "shelf_cache.round_trip";

/**
 * La durée FINALE d'un appel abandonné au délai, quand il finit par aboutir
 * (`outcome: settled`) ou par échouer (`failed`) — ce que l'objet a vraiment
 * mis, que la mesure arrêtée à l'abandon ne dit pas (C5, 2026-11-05).
 */
export const SHELF_LATE_FINISH_TIMING = "shelf_cache.late_finish";

/**
 * **Le délai et le disjoncteur de TOUT appel au chemin `objets.interne/rayons`** —
 * rayons pro (C2) comme rayon public (C3). Un seul disjoncteur, parce qu'il
 * n'y a qu'un chemin et qu'un objet derrière : une panne vue par le rayon pro
 * épargne donc aussi le délai au rayon public, et l'inverse.
 *
 * La mécanique est celle de tout cache appelé par le réseau
 * ({@link BoundedCallGuard}) ; ce garde n'y ajoute que les seuils du rayon,
 * ses noms de mesure ({@link SHELF_ROUND_TRIP_TIMING}) et ses signaux. Toute
 * erreur, lenteur ou réponse illisible devient `null`, comptée sous un nom
 * stable. Rien de ce qui sort d'ici ne lève (§ 4 bis).
 *
 * `gated` : l'appel respecte-t-il le disjoncteur ? Les lectures oui ; les
 * effacements non — une purge est rare et c'est la seule chose qui rattrape
 * un rayon devenu faux.
 */
@Injectable()
export class ShelfCallGuard {
  private readonly guard: BoundedCallGuard<ShelfCacheOperation>;

  constructor(
    deadline: ShelfCallDeadline,
    wall: WallClock,
    stopwatch: Stopwatch,
    timings: TimingRecorder,
    signals: ShelfCacheSignals,
  ) {
    this.guard = new BoundedCallGuard<ShelfCacheOperation>({
      cache: SHELF_CACHE_NAME,
      limitMs: SHELF_CALL_LIMIT_MS,
      breaker: new ShelfCacheBreaker(),
      deadline,
      wall,
      stopwatch,
      timings,
      listener: {
        fallback: (operation, reason) => signals.emit({ name: "fallback", operation, reason }),
        breakerOpened: (failures) => signals.emit({ name: "breaker_opened", failures }),
        breakerClosed: () => signals.emit({ name: "breaker_closed" }),
      },
      isUnreadable: (error) => error instanceof UnreadableShelfReplyError,
    });
  }

  /** @param limitMs le délai de l'appel — {@link SHELF_CALL_LIMIT_MS}, sauf pour un rangement. */
  call<T>(
    operation: ShelfCacheOperation,
    work: () => Promise<T>,
    gated: boolean,
    limitMs: number = SHELF_CALL_LIMIT_MS,
  ): Promise<T | null> {
    return this.guard.call(operation, work, gated, limitMs);
  }
}
