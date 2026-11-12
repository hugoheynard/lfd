import { ScriptedCallDeadline } from "../../../../platform/cache-calls/__tests__/cache-call-doubles.js";
import { VersionedContentCache } from "../../../../platform/day-versions/versioned-content-cache.js";
import { VersionedContents } from "../../../../platform/day-versions/versioned-contents.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../../../platform/time/fixed-wall-clock.js";
import { PimChangeVersionReader } from "../../domain/ports/pim-change-version.reader.js";
import { listContent } from "../pim-content-keys.js";
import { VersionedPimContents } from "../pim-contents.js";

/**
 * Les contenus du référentiel sous le numéro `pim` (`plan-lectures-du-pim.md`,
 * § 4.2) : le numéro est lu AVANT la charge, et une clé refusée lit la base.
 */

class MemoryContents extends VersionedContentCache {
  readonly kept = new Map<string, { version: number; body: string }>();
  read(key: string, version: number): Promise<string | null> {
    const kept = this.kept.get(key);
    return Promise.resolve(kept?.version === version ? kept.body : null);
  }
  store(key: string, version: number, body: string): Promise<void> {
    this.kept.set(key, { version, body });
    return Promise.resolve();
  }
}

class SteppedVersion extends PimChangeVersionReader {
  version = 1;
  readonly order: string[] = [];
  versionOf(): Promise<number> {
    this.order.push("version");
    return Promise.resolve(this.version);
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function around() {
  const cache = new MemoryContents();
  const versions = new SteppedVersion();
  const contents = new VersionedPimContents(
    versions,
    new VersionedContents(
      cache,
      new ScriptedCallDeadline(),
      new FixedWallClock(new Date(Date.UTC(2030, 0, 1))),
      new FixedStopwatch(3),
      new RecordingTimings(),
    ),
  );
  let loads = 0;
  const load = (): Promise<string[]> => {
    loads += 1;
    versions.order.push("load");
    return Promise.resolve([`charge ${loads}`]);
  };
  return { cache, versions, contents, load, loads: () => loads };
}

describe("VersionedPimContents", () => {
  it("lit le numéro avant la charge", async () => {
    const { contents, versions, load } = around();

    await contents.contentOf("pim-products", load, listContent<string>());

    expect(versions.order).toEqual(["version", "load"]);
  });

  it("au même numéro, la charge rangée est servie sans relire", async () => {
    const { contents, load, loads } = around();
    await contents.contentOf("pim-products", load, listContent<string>());
    await settle();

    const second = await contents.contentOf("pim-products", load, listContent<string>());

    expect(loads()).toBe(1);
    expect(second).toEqual(["charge 1"]);
  });

  it("un numéro qui change fait relire", async () => {
    const { contents, versions, load, loads } = around();
    await contents.contentOf("pim-products", load, listContent<string>());
    await settle();
    versions.version = 2;

    const second = await contents.contentOf("pim-products", load, listContent<string>());

    expect(loads()).toBe(2);
    expect(second).toEqual(["charge 2"]);
  });

  it("une clé `null` lit la base sans lire le numéro ni rien ranger", async () => {
    const { contents, versions, cache, load } = around();

    await contents.contentOf(null, load, listContent<string>());
    await settle();

    expect(versions.order).toEqual(["load"]);
    expect(cache.kept.size).toBe(0);
  });
});
