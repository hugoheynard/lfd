import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import { FixedStopwatch, RecordingTimings } from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import { type PackedContent, packContent } from "../content-compression.js";
import { VersionedContentCache } from "../versioned-content-cache.js";
import { VERSIONED_CONTENT_MAX_BYTES, VersionedContents } from "../versioned-contents.js";

/**
 * Les contenus versionnés (`le-cache-du-back-office.md`, § 4.5) : servis
 * depuis l'objet au même numéro, relus une fois quand il change, jamais
 * rangés au-delà du plafond, et la base quand l'objet manque.
 */

interface Content {
  readonly label: string;
}

const isContent = (raw: unknown): raw is Content =>
  typeof raw === "object" && raw !== null && typeof Reflect.get(raw, "label") === "string";

class MemoryContents extends VersionedContentCache {
  readonly kept = new Map<string, { version: number; body: Uint8Array }>();
  failing = false;
  stores = 0;
  rawBytes: number | null = null;

  read(key: string, version: number): Promise<Uint8Array | null> {
    if (this.failing) {
      return Promise.reject(new Error("objet injoignable"));
    }
    const kept = this.kept.get(key);
    return Promise.resolve(kept?.version === version ? kept.body : null);
  }

  store(key: string, version: number, content: PackedContent): Promise<void> {
    this.stores += 1;
    this.rawBytes = content.rawBytes;
    this.kept.set(key, { version, body: content.bytes });
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

  it("range la charge compressée (gzip), et la relit décompressée", async () => {
    const { contents, cache, load } = around();
    await contents.contentOf("k", 7, load("a"), isContent);
    await settle();

    const kept = cache.kept.get("k")?.body ?? new Uint8Array();
    expect([kept[0], kept[1]]).toEqual([0x1f, 0x8b]);
    expect(cache.rawBytes).toBe('{"label":"a"}'.length);
    await expect(contents.contentOf("k", 7, load("b"), isContent)).resolves.toEqual({
      label: "a",
    });
  });

  it("le plafond se mesure compressé : une charge brute plus lourde mais compressible est rangée", async () => {
    const { contents, cache, load } = around();
    const heavy = "x".repeat(VERSIONED_CONTENT_MAX_BYTES);

    await contents.contentOf("k", 7, load(heavy), isContent);
    await settle();

    expect(cache.stores).toBe(1);
    expect(cache.kept.get("k")?.body.byteLength).toBeLessThan(VERSIONED_CONTENT_MAX_BYTES);
  });

  it("au-delà du plafond une fois compressée, sert la charge sans la ranger", async () => {
    const { contents, cache, load } = around();
    // ~6 bits par caractère : deux fois le plafond en clair en fait ~1,5 Mo compressé.
    const heavy = incompressible(2 * VERSIONED_CONTENT_MAX_BYTES);

    const served = await contents.contentOf("k", 7, load(heavy), isContent);
    await settle();

    expect(served.label).toHaveLength(2 * VERSIONED_CONTENT_MAX_BYTES);
    expect(cache.stores).toBe(0);
  });

  it("une entrée rangée en JSON clair avant la compression se lit sans erreur", async () => {
    const { contents, cache, load, loads } = around();
    cache.kept.set("k", { version: 7, body: new TextEncoder().encode('{"label":"ancien"}') });

    await expect(contents.contentOf("k", 7, load("a"), isContent)).resolves.toEqual({
      label: "ancien",
    });
    expect(loads()).toBe(0);
  });

  it("des octets corrompus sont un raté : la base, sans lever", async () => {
    const { contents, cache, load, loads } = around();
    cache.kept.set("k", { version: 7, body: new Uint8Array([0x1f, 0x8b, 0xff, 0x00, 0x13]) });

    await expect(contents.contentOf("k", 7, load("a"), isContent)).resolves.toEqual({
      label: "a",
    });
    expect(loads()).toBe(1);
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
    cache.kept.set("k", { version: 7, body: (await packContent('{"autre":1}')).bytes });

    await expect(contents.contentOf("k", 7, load("a"), isContent)).resolves.toEqual({
      label: "a",
    });
    expect(loads()).toBe(1);
  });
});
