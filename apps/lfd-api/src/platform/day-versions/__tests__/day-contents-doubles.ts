import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import {
  FixedStopwatch,
  RecordingCacheOutcomes,
  RecordingTimings,
} from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import type { PackedContent } from "../content-compression.js";
import { type DayContentAddress, DayContentsCache } from "../day-contents-cache.js";
import { DayContents } from "../day-contents.js";
import { NoDayContentsCache } from "../no-day-contents-cache.js";

// L'instant du mur des appels à l'objet, comparé à lui-même seulement (délai, disjoncteur).
const WALL_START = new Date(Date.UTC(2030, 0, 1));

/**
 * L'objet des journées en mémoire : une charge par (écran, journée), servie
 * à étiquette égale, chaque rangement noté. `failing` le rend injoignable.
 */
export class MemoryDayContents extends DayContentsCache {
  readonly kept = new Map<string, { readonly tag: string; readonly body: Uint8Array }>();
  readonly stored: DayContentAddress[] = [];
  failing = false;

  read(address: DayContentAddress): Promise<Uint8Array | null> {
    if (this.failing) {
      return Promise.reject(new TypeError("objet injoignable"));
    }
    const kept = this.kept.get(`${address.screen}/${address.day}`);
    return Promise.resolve(kept?.tag === address.tag ? kept.body : null);
  }

  store(address: DayContentAddress, content: PackedContent): Promise<void> {
    this.stored.push(address);
    this.kept.set(`${address.screen}/${address.day}`, { tag: address.tag, body: content.bytes });
    return Promise.resolve();
  }
}

/** Les contenus de journée autour d'un objet donné — « sans objet » par défaut. */
export function dayContentsOver(cache: DayContentsCache = new NoDayContentsCache()): DayContents {
  return new DayContents(
    cache,
    new ScriptedCallDeadline(),
    new FixedWallClock(WALL_START),
    new FixedStopwatch(3),
    new RecordingTimings(),
    new RecordingCacheOutcomes(),
  );
}

/** Laisse partir le rangement, posé après la réponse. */
export async function settleStore(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}
