import {
  StorefrontMediaUsage,
  type StorefrontMediaUsageEntry,
} from "../../b2b/storefront/channels/media/storefront-media-usage.js";
import { StorefrontMediaCarriers } from "../storefront-media-carriers.js";

const IMAGE = "https://media.test/noel.png";

/** La vitrine, doublée : elle répond ce qu'on lui a mis. */
class StubUsage extends StorefrontMediaUsage {
  constructor(
    private readonly counts: ReadonlyMap<string, number>,
    private readonly usages: readonly StorefrontMediaUsageEntry[],
  ) {
    super();
  }

  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.counts);
  }

  usagesOf(): Promise<readonly StorefrontMediaUsageEntry[]> {
    return Promise.resolve(this.usages);
  }
}

describe("StorefrontMediaCarriers", () => {
  it("rend les comptes de la vitrine tels quels", async () => {
    const carriers = new StorefrontMediaCarriers(new StubUsage(new Map([[IMAGE, 2]]), []));

    expect(await carriers.usesOf([IMAGE])).toEqual(new Map([[IMAGE, 2]]));
  });

  it("traduit chaque usage en porteur `storefront`, l'objet pour identifiant", async () => {
    const carriers = new StorefrontMediaCarriers(
      new StubUsage(new Map(), [{ objectId: "obj_1", label: "Tuile Noël" }]),
    );

    expect(await carriers.carriersOf(IMAGE)).toEqual([
      { kind: "storefront", id: "obj_1", label: "Tuile Noël" },
    ]);
  });
});
