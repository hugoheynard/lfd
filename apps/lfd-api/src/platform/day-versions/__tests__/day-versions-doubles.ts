import type { DayJournal, StaffPermission } from "@lfd/contracts";

import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import { FixedStopwatch, RecordingTimings } from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import { DayVersionRegistry } from "../day-version-registry.js";
import { DayVersionSource } from "../day-version-source.js";
import { type DayVersionsCard, DayVersionsCache } from "../day-versions-cache.js";
import { GetDayVersionsHandler } from "../get-day-versions.handler.js";
import { ResilientDayVersionsCache } from "../resilient-day-versions-cache.js";

/** Une source qui rend une version fixe et retient les journées demandées. */
export class RecordingSource extends DayVersionSource {
  readonly asked: string[] = [];
  private held: (() => void)[] | null = null;

  constructor(
    readonly journal: DayJournal,
    readonly readers: readonly [StaffPermission, ...StaffPermission[]],
    public version: number,
  ) {
    super();
  }

  /** Les lectures attendent {@link release} : une relecture en cours. */
  hold(): void {
    this.held = [];
  }

  release(): void {
    for (const resume of this.held?.splice(0) ?? []) {
      resume();
    }
    this.held = null;
  }

  versionOf(serviceDay: string): Promise<number> {
    this.asked.push(serviceDay);
    const held = this.held;
    if (held === null) {
      return Promise.resolve(this.version);
    }
    return new Promise<void>((resolve) => held.push(resolve)).then(() => this.version);
  }
}

/** Ce que fait l'objet : garder, échouer, ou ne jamais répondre. */
export type CacheBehaviour = "keeps" | "throws" | "hangs";

/** L'objet des journées en mémoire : une carte par journée, gardée si lue plus tard. */
export class InMemoryDayVersionsCache extends DayVersionsCache {
  readonly cards = new Map<string, DayVersionsCard>();
  behaviour: CacheBehaviour = "keeps";
  reads = 0;
  stores = 0;

  read(serviceDay: string): Promise<DayVersionsCard | null> {
    this.reads += 1;
    return this.behave(() => this.cards.get(serviceDay) ?? null);
  }

  store(serviceDay: string, card: DayVersionsCard): Promise<void> {
    this.stores += 1;
    return this.behave(() => {
      const kept = this.cards.get(serviceDay);
      if (kept === undefined || card.readAtMs > kept.readAtMs) {
        this.cards.set(serviceDay, card);
      }
    });
  }

  private behave<T>(work: () => T): Promise<T> {
    switch (this.behaviour) {
      case "keeps":
        return Promise.resolve(work());
      case "throws":
        return Promise.reject(new TypeError("objet des journées injoignable"));
      case "hangs":
        return new Promise<T>(() => undefined);
    }
  }
}

export function sources(): Record<DayJournal, RecordingSource> {
  return {
    orders: new RecordingSource("orders", ["b2b_orders:read", "handover_counter:read"], 7),
    production: new RecordingSource("production", ["production_plan:read"], 42),
    delivery: new RecordingSource("delivery", ["delivery_rounds:read"], 3),
    "my-round": new RecordingSource("my-round", ["delivery_driving:read"], 11),
  };
}

// L'instant du mur, comparé à lui-même seulement (fraîcheur, disjoncteur).
const WALL_START = new Date(Date.UTC(2030, 0, 1));

/** Le handler, son objet, son délai et son mur, autour des sources données. */
export function handlerAround(all: readonly DayVersionSource[]) {
  const cache = new InMemoryDayVersionsCache();
  const deadline = new ScriptedCallDeadline();
  const wall = new FixedWallClock(WALL_START);
  const timings = new RecordingTimings();
  const resilient = new ResilientDayVersionsCache(
    cache,
    deadline,
    wall,
    new FixedStopwatch(3),
    timings,
  );
  const handler = new GetDayVersionsHandler(new DayVersionRegistry(all), resilient, wall);
  return { handler, cache, deadline, wall, timings };
}

/** Laisse partir les rangements non attendus. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}
