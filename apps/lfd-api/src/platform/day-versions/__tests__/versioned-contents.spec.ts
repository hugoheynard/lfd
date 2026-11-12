import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import { FixedStopwatch, RecordingTimings } from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import { VersionedContentCache } from "../versioned-content-cache.js";
import { VERSIONED_CONTENT_MAX_BYTES, VersionedContents } from "../versioned-contents.js";

/**
 * Les contenus versionnés (`plan-catalogue-du-back-office.md`, § 3.5) : servis
 * depuis l'objet au même numéro, relus une fois quand il change, jamais
 * rangés au-delà du plafond, et la base quand l'objet manque.
 */

interface Content {
  readonly label: string;
}

const isContent = (raw: unknown): raw is Content =>
  typeof raw === "object" && raw !== null && typeof Reflect.get(raw, "label") === "string";

class MemoryContents extends VersionedContentCache {
  readonly kept = new Map<string, { version: number; body: string }>();
  failing = false;
  stores = 0;

  read(key: string, version: number): Promise<string | null> {
    if (this.failing) {
      return Promise.reject(new Error("objet injoignable"));
    }
    const kept = this.kept.get(key);
    return Promise.resolve(kept?.version === version ? kept.body : null);
  }

  store(key: string, version: number, body: string): Promise<void> {
    this.stores += 1;
    this.kept.set(key, { version, body });
    return Promise.resolve();
  }
}

function around() {
  const cache = new MemoryContents();
  const deadline = new ScriptedCallDeadline();
  const contents = new VersionedContents(
    cache,
    deadline,
    new FixedWallClock(new Date(Date.UTC(2030, 0, 1))),
    new FixedStopwatch(3),
    new RecordingTimings(),
  );
  let loads = 0;
  const load = (label: string) => (): Promise<Content> => {
    loads += 1;
    return Promise.resolve({ label });
  };
  return { cache, deadline, contents, load, loads: () => loads };
}

/** Le rangement part après la réponse : laisser passer ses micro-tâches. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("VersionedContents", () => {
  it("au même numéro, sert la charge rangée sans relire la base", async () => {
    const { contents, load, loads } = around();
    await contents.contentOf("k", 7, load("a"), isContent);
    await settle();

    const second = await contents.contentOf("k", 7, load("b"), isContent);

    expect(second).toEqual({ label: "a" });
    expect(loads()).toBe(1);
  });

  it("relit la base quand le numéro a changé, et range la nouvelle charge", async () => {
    const { contents, cache, load, loads } = around();
    await contents.contentOf("k", 7, load("a"), isContent);
    await settle();

    const changed = await contents.contentOf("k", 8, load("b"), isContent);
    await settle();

    expect(changed).toEqual({ label: "b" });
    expect(loads()).toBe(2);
    expect(cache.kept.get("k")?.version).toBe(8);
  });

  it("une seule lecture pour des appels simultanés au même numéro (single-flight)", async () => {
    const { contents, load, loads } = around();

    const both = await Promise.all([
      contents.contentOf("k", 7, load("a"), isContent),
      contents.contentOf("k", 7, load("a"), isContent),
    ]);

    expect(both).toEqual([{ label: "a" }, { label: "a" }]);
    expect(loads()).toBe(1);
  });

  it("au-delà du plafond, sert la charge sans la ranger", async () => {
    const { contents, cache, load } = around();
    const heavy = "x".repeat(VERSIONED_CONTENT_MAX_BYTES);

    const served = await contents.contentOf("k", 7, load(heavy), isContent);
    await settle();

    expect(served.label).toHaveLength(VERSIONED_CONTENT_MAX_BYTES);
    expect(cache.stores).toBe(0);
  });

  it("objet indisponible : la base, sans lever", async () => {
    const { contents, cache, load, loads } = around();
    cache.failing = true;

    await expect(contents.contentOf("k", 7, load("a"), isContent)).resolves.toEqual({
      label: "a",
    });
    expect(loads()).toBe(1);
  });

  it("objet trop lent : la base", async () => {
    const { contents, deadline, load, loads } = around();
    deadline.late = true;

    await expect(contents.contentOf("k", 7, load("a"), isContent)).resolves.toEqual({
      label: "a",
    });
    expect(loads()).toBe(1);
  });

  it("une charge rangée d'une forme inattendue est relue en base", async () => {
    const { contents, cache, load, loads } = around();
    cache.kept.set("k", { version: 7, body: '{"autre":1}' });

    await expect(contents.contentOf("k", 7, load("a"), isContent)).resolves.toEqual({
      label: "a",
    });
    expect(loads()).toBe(1);
  });
});
