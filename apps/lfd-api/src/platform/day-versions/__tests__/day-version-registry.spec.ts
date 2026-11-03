import type { DayJournal, StaffPermission } from "@lfd/contracts";

import {
  DayVersionRegistry,
  DayVersionRegistryMisassembledError,
} from "../day-version-registry.js";
import { DayVersionSource } from "../day-version-source.js";

class FixedSource extends DayVersionSource {
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = ["b2b_orders:read"];
  constructor(readonly journal: DayJournal) {
    super();
  }
  versionOf(): Promise<number> {
    return Promise.resolve(0);
  }
}

const EVERY_JOURNAL: readonly DayJournal[] = ["orders", "production", "delivery", "my-round"];

describe("DayVersionRegistry — une seule déclaration par journal", () => {
  it("rend la source de chaque journal du contrat", () => {
    const sources = EVERY_JOURNAL.map((journal) => new FixedSource(journal));
    const registry = new DayVersionRegistry(sources);

    for (const source of sources) {
      expect(registry.sourceOf(source.journal)).toBe(source);
    }
  });

  it("refuse de se construire quand un journal du contrat n'a pas de source", () => {
    const build = () =>
      new DayVersionRegistry([new FixedSource("orders"), new FixedSource("production")]);

    expect(build).toThrow(DayVersionRegistryMisassembledError);
    expect(build).toThrow(/« delivery », « my-round »/u);
  });

  it("refuse de se construire quand un journal a deux sources", () => {
    const build = () =>
      new DayVersionRegistry([
        ...EVERY_JOURNAL.map((journal) => new FixedSource(journal)),
        new FixedSource("production"),
      ]);

    expect(build).toThrow(/« production » a deux sources/u);
  });
});
