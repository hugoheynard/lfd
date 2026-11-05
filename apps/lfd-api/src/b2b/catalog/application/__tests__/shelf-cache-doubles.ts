import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../../../platform/time/fixed-wall-clock.js";
import type { ShelfPurgeOrder } from "../../../shared/shelf-changes/domain/shelf-purge-batch.js";
import { UnreadableShelfReplyError } from "../../domain/errors/unreadable-shelf-reply.error.js";
import { ShelfCallDeadline, type Deadlined } from "../../domain/ports/shelf-call-deadline.js";
import {
  ShelfCacheSignals,
  type ShelfCacheSignal,
} from "../../domain/ports/shelf-cache-signals.js";
import {
  ShopShelfCache,
  type ShelfKey,
  type ShelfLookup,
  type ShelfToStore,
  type StoreOutcome,
} from "../../domain/ports/shop-shelf-cache.js";
import { InMemoryShopShelfCache } from "../../infrastructure/in-memory-shop-shelf-cache.js";
import type { ShopShelfEraser } from "../../domain/ports/shop-shelf-eraser.js";
import { ResilientShopShelfCache } from "../resilient-shop-shelf-cache.js";
import { ShelfCallGuard } from "../shelf-call-guard.js";

/** Les signaux émis, dans l'ordre. */
export class RecordingShelfSignals extends ShelfCacheSignals {
  readonly emitted: ShelfCacheSignal[] = [];

  emit(signal: ShelfCacheSignal): void {
    this.emitted.push(signal);
  }

  names(): readonly string[] {
    return this.emitted.map((signal) => signal.name);
  }
}

/**
 * Un délai tenu à la main : `late` déclare tout appel en retard sans
 * l'attendre — c'est un appel qui ne répond jamais, vu du repli.
 */
export class ScriptedDeadline extends ShelfCallDeadline {
  late = false;
  readonly limits: number[] = [];

  within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>> {
    this.limits.push(limitMs);
    if (this.late) {
      return Promise.resolve({ kind: "late" });
    }
    return work.then((value): Deadlined<T> => ({ kind: "in_time", value }));
  }
}

/** Ce que fait un magasin en panne. */
export type ShelfFailure = "throws" | "unreadable" | "hangs";

/** Un magasin qui échoue toujours de la même façon, et compte ses appels. */
export class BrokenShelfCache extends ShopShelfCache implements ShopShelfEraser {
  calls = 0;

  constructor(private readonly failure: ShelfFailure) {
    super();
  }

  read(): Promise<ShelfLookup> {
    return this.fail();
  }

  store(): Promise<StoreOutcome> {
    return this.fail();
  }

  erase(_order: ShelfPurgeOrder): Promise<void> {
    return this.fail();
  }

  private fail<T>(): Promise<T> {
    this.calls += 1;
    switch (this.failure) {
      case "throws":
        return Promise.reject(new RangeError("magasin des rayons injoignable"));
      case "unreadable":
        return Promise.reject(new UnreadableShelfReplyError("essai"));
      case "hangs":
        return new Promise<T>(() => undefined);
    }
  }
}

/**
 * Un magasin en mémoire LENT : lectures et rangements attendent `release()`.
 * C'est l'objet des rayons au-delà de son délai, vu de l'application.
 */
export class SlowShelfCache extends InMemoryShopShelfCache {
  private readonly held: (() => void)[] = [];
  storesStarted = 0;

  /** @param slowReads `false` : seuls les rangements attendent. */
  constructor(private readonly slowReads = true) {
    super();
  }

  override read(key: ShelfKey, now: Date): Promise<ShelfLookup> {
    if (!this.slowReads) {
      return super.read(key, now);
    }
    return this.hold().then(() => super.read(key, now));
  }

  override store(entry: ShelfToStore): Promise<StoreOutcome> {
    this.storesStarted += 1;
    return this.hold().then(() => super.store(entry));
  }

  /** Laisse aboutir tout ce qui attend. */
  release(): void {
    for (const resume of this.held.splice(0)) {
      resume();
    }
  }

  private hold(): Promise<void> {
    return new Promise<void>((resolve) => this.held.push(resolve));
  }
}

/** Le repli autour d'un magasin, et ses instruments. */
export interface ResilientRig {
  readonly resilient: ResilientShopShelfCache;
  /** Le délai et le disjoncteur, partagés avec le rayon public (C3). */
  readonly guard: ShelfCallGuard;
  readonly signals: RecordingShelfSignals;
  readonly deadline: ScriptedDeadline;
  readonly wall: FixedWallClock;
  readonly timings: RecordingTimings;
}

/** L'instant du mur, comparé à lui-même seulement (disjoncteur). */
const WALL_START = new Date(Date.UTC(2030, 0, 1));

export function resilientAround(cache: ShopShelfCache & ShopShelfEraser): ResilientRig {
  const signals = new RecordingShelfSignals();
  const deadline = new ScriptedDeadline();
  const wall = new FixedWallClock(WALL_START);
  const timings = new RecordingTimings();
  const guard = new ShelfCallGuard(deadline, wall, new FixedStopwatch(7), timings, signals);
  const resilient = new ResilientShopShelfCache(cache, cache, guard, signals);
  return { resilient, guard, signals, deadline, wall, timings };
}
