import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import { FixedStopwatch, RecordingTimings } from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import { type PackedContent, packContent } from "../content-compression.js";
import { type DayContentAddress, DayContentsCache } from "../day-contents-cache.js";
import { DAY_CONTENT_MAX_BYTES, type DayContentRequest, DayContents } from "../day-contents.js";
import { InvalidDayContentTagError } from "../invalid-day-content-tag.error.js";

/**
 * Les contenus des écrans de journée (`le-cache-du-back-office.md`, § 3.1) :
 * servis depuis l'objet à étiquette égale, relus une fois quand elle change,
 * jamais rangés dégradés ni au-delà du plafond, et la base quand l'objet manque.
 */

interface Sheet {
  readonly label: string;
  readonly degraded?: boolean;
}

const isSheet = (raw: unknown): raw is Sheet =>
  typeof raw === "object" && raw !== null && typeof Reflect.get(raw, "label") === "string";

const RULES = { accepts: isSheet, storable: (sheet: Sheet) => sheet.degraded !== true };

const at = (orders: number, production = 4): DayContentRequest => ({
  screen: "worksheet",
  day: "2030-03-12",
  versions: [
    { subject: "production", version: production },
    { subject: "orders", version: orders },
  ],
});

class MemoryDayContents extends DayContentsCache {
  readonly kept = new Map<string, { tag: string; body: Uint8Array }>();
  failing = false;
  readonly stored: DayContentAddress[] = [];

  read(address: DayContentAddress): Promise<Uint8Array | null> {
    if (this.failing) {
      return Promise.reject(new Error("objet injoignable"));
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

function around() {
  const cache = new MemoryDayContents();
  const deadline = new ScriptedCallDeadline();
  const contents = new DayContents(
    cache,
    deadline,
    new FixedWallClock(new Date(Date.UTC(2030, 0, 1))),
    new FixedStopwatch(3),
    new RecordingTimings(),
  );
  let loads = 0;
  const load =
    (label: string, degraded = false) =>
    (): Promise<Sheet> => {
      loads += 1;
      return Promise.resolve(degraded ? { label, degraded } : { label });
    };
  return { cache, deadline, contents, load, loads: () => loads };
}

/** Une chaîne que gzip réduit peu : un xorshift 32 bits, déterministe. */
function incompressible(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let seed = 12_345;
  let out = "";
  for (let i = 0; i < length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    out += alphabet[(seed >>> 0) % alphabet.length];
  }
  return out;
}

/** Le rangement part après la réponse : laisser passer ses micro-tâches. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("DayContents", () => {
  it("aux mêmes numéros, sert la charge rangée sans relire la base", async () => {
    const { contents, load, loads } = around();
    await contents.contentOf(at(7), load("a"), RULES);
    await settle();

    await expect(contents.contentOf(at(7), load("b"), RULES)).resolves.toEqual({ label: "a" });
    expect(loads()).toBe(1);
  });

  it("un numéro changé est un raté : relu en base et rangé sous la nouvelle étiquette", async () => {
    const { contents, cache, load, loads } = around();
    await contents.contentOf(at(7), load("a"), RULES);
    await settle();

    await expect(contents.contentOf(at(8), load("b"), RULES)).resolves.toEqual({ label: "b" });
    await settle();
    expect(loads()).toBe(2);
    expect(cache.stored.map((address) => address.tag)).toEqual([
      "orders:7.production:4",
      "orders:8.production:4",
    ]);
  });

  it("une seule relecture pour des appels simultanés à la même étiquette", async () => {
    const { contents, load, loads } = around();

    const both = await Promise.all([
      contents.contentOf(at(7), load("a"), RULES),
      contents.contentOf(at(7), load("a"), RULES),
    ]);

    expect(both).toEqual([{ label: "a" }, { label: "a" }]);
    expect(loads()).toBe(1);
  });

  it("un contenu dégradé (storable faux) est servi, jamais rangé", async () => {
    const { contents, cache, load } = around();

    await expect(contents.contentOf(at(7), load("a", true), RULES)).resolves.toEqual({
      label: "a",
      degraded: true,
    });
    await settle();
    expect(cache.stored).toHaveLength(0);
  });

  it("au-delà du plafond une fois compressé, servi sans être rangé", async () => {
    const { contents, cache, load } = around();
    const heavy = incompressible(2 * DAY_CONTENT_MAX_BYTES);

    const served = await contents.contentOf(at(7), load(heavy), RULES);
    await settle();

    expect(served.label).toHaveLength(2 * DAY_CONTENT_MAX_BYTES);
    expect(cache.stored).toHaveLength(0);
  });

  it("une charge illisible ou d'une autre forme est relue en base, sans lever", async () => {
    const { contents, cache, load, loads } = around();
    const key = "worksheet/2030-03-12";
    const tag = "orders:7.production:4";
    cache.kept.set(key, { tag, body: new Uint8Array([0x1f, 0x8b, 0xff, 0x00, 0x13]) });
    await expect(contents.contentOf(at(7), load("a"), RULES)).resolves.toEqual({ label: "a" });

    cache.kept.set(key, { tag, body: (await packContent('{"autre":1}')).bytes });
    await expect(contents.contentOf(at(7), load("b"), RULES)).resolves.toEqual({ label: "b" });
    expect(loads()).toBe(2);
  });

  it("objet indisponible ou trop lent : la base, sans lever", async () => {
    const { contents, cache, deadline, load, loads } = around();
    cache.failing = true;
    await expect(contents.contentOf(at(7), load("a"), RULES)).resolves.toEqual({ label: "a" });

    cache.failing = false;
    deadline.late = true;
    await expect(contents.contentOf(at(7), load("b"), RULES)).resolves.toEqual({ label: "b" });
    expect(loads()).toBe(2);
  });

  it("l'étiquette ne dépend pas de l'ordre dans lequel l'écran nomme ses sujets", async () => {
    const { contents, cache, load, loads } = around();
    await contents.contentOf(at(7), load("a"), RULES);
    await settle();

    const reversed: DayContentRequest = { ...at(7), versions: [...at(7).versions].reverse() };
    await expect(contents.contentOf(reversed, load("b"), RULES)).resolves.toEqual({ label: "a" });
    expect(loads()).toBe(1);
    expect(cache.stored[0]?.tag).toBe("orders:7.production:4");
  });

  it("refuse des numéros qui ne forment pas une étiquette, sans lire la base", async () => {
    const { contents, load, loads } = around();
    const doubled: DayContentRequest = {
      ...at(7),
      versions: [
        { subject: "orders", version: 1 },
        { subject: "orders", version: 2 },
      ],
    };

    await expect(contents.contentOf(doubled, load("a"), RULES)).rejects.toBeInstanceOf(
      InvalidDayContentTagError,
    );
    expect(loads()).toBe(0);
  });
});
