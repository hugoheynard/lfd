import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GeocodeCachePruner } from "../../../domain/ports/geocode-cache.pruner.js";
import { GEOCODE_TTL_DAYS } from "../../delivery-routing-support.js";
import {
  GEOCODE_PURGE_BATCH_SIZE,
  PurgeStaleGeocodesHandler,
} from "../purge-stale-geocodes.handler.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Un cache en mémoire : des instants de géocodage, effacés par lots comme en base. */
class InMemoryPruner extends GeocodeCachePruner {
  readonly calls: { readonly instant: Date; readonly limit: number }[] = [];
  constructor(public rows: Date[]) {
    super();
  }
  pruneBatchBefore(instant: Date, limit: number): Promise<number> {
    this.calls.push({ instant, limit });
    const stale = this.rows.filter((at) => at < instant).slice(0, limit);
    this.rows = this.rows.filter((at) => !stale.includes(at));
    return Promise.resolve(stale.length);
  }
}

describe("PurgeStaleGeocodesHandler", () => {
  const clock = new FixedClock(new Date());
  const daysAgo = (days: number): Date => new Date(clock.now().getTime() - days * MS_PER_DAY);

  it("efface à 366 jours, garde à 364 : la frontière est celle de la lecture", async () => {
    const kept = daysAgo(364);
    const pruner = new InMemoryPruner([daysAgo(366), kept]);

    await expect(new PurgeStaleGeocodesHandler(pruner, clock).execute()).resolves.toBe(1);

    expect(pruner.rows).toEqual([kept]);
    expect(pruner.calls[0]?.instant).toEqual(daysAgo(GEOCODE_TTL_DAYS));
  });

  it("garde une entrée géocodée exactement à la frontière (encore lue)", async () => {
    const pruner = new InMemoryPruner([daysAgo(GEOCODE_TTL_DAYS)]);

    await expect(new PurgeStaleGeocodesHandler(pruner, clock).execute()).resolves.toBe(0);
  });

  it("est idempotent : un second passage ne trouve plus rien", async () => {
    const pruner = new InMemoryPruner([daysAgo(400), daysAgo(500)]);
    const handler = new PurgeStaleGeocodesHandler(pruner, clock);

    await expect(handler.execute()).resolves.toBe(2);
    await expect(handler.execute()).resolves.toBe(0);
  });

  it("enchaîne les lots bornés jusqu'au lot incomplet, et rend le total", async () => {
    const total = GEOCODE_PURGE_BATCH_SIZE * 2 + 3;
    const pruner = new InMemoryPruner(Array.from({ length: total }, (_, i) => daysAgo(400 + i)));

    await expect(new PurgeStaleGeocodesHandler(pruner, clock).execute()).resolves.toBe(total);

    expect(pruner.calls.map((call) => call.limit)).toEqual([
      GEOCODE_PURGE_BATCH_SIZE,
      GEOCODE_PURGE_BATCH_SIZE,
      GEOCODE_PURGE_BATCH_SIZE,
    ]);
    expect(pruner.rows).toEqual([]);
  });

  it("s'arrête après un lot plein suivi d'un lot vide", async () => {
    const pruner = new InMemoryPruner(
      Array.from({ length: GEOCODE_PURGE_BATCH_SIZE }, (_, i) => daysAgo(400 + i)),
    );

    await expect(new PurgeStaleGeocodesHandler(pruner, clock).execute()).resolves.toBe(
      GEOCODE_PURGE_BATCH_SIZE,
    );
    expect(pruner.calls).toHaveLength(2);
  });
});
