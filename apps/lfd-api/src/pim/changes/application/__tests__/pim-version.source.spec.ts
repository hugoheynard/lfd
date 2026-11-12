import { PimChangeVersionReader } from "../../domain/ports/pim-change-version.reader.js";
import { PIM_FRESH_MS, PimVersionSource } from "../pim-version.source.js";

class FixedVersion extends PimChangeVersionReader {
  constructor(private readonly version: number) {
    super();
  }
  versionOf(): Promise<number> {
    return Promise.resolve(this.version);
  }
}

describe("PimVersionSource", () => {
  it("rend le numéro du journal du référentiel", async () => {
    await expect(new PimVersionSource(new FixedVersion(42)).versionOf()).resolves.toBe(42);
  });

  it("s'ouvre à qui lit une part du référentiel, fenêtre de 30 s", () => {
    const source = new PimVersionSource(new FixedVersion(0));

    expect(source.subject).toBe("pim");
    expect(source.readers).toEqual([
      "pim_catalog:read",
      "pim_tax:read",
      "pim_settings:read",
      "allergen_matrix:read",
    ]);
    expect(source.freshMs).toBe(PIM_FRESH_MS);
    expect(PIM_FRESH_MS).toBe(30_000);
  });
});
