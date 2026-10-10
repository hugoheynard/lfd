import {
  StorefrontImageRepointing,
  type StorefrontImageChange,
} from "../../b2b/storefront/channels/media/storefront-image-repointing.js";
import {
  StorefrontMediaUsage,
  type StorefrontMediaUsageEntry,
} from "../../b2b/storefront/channels/media/storefront-media-usage.js";
import { RecordingMediaJournal } from "../../media/journal/__tests__/recording-media-journal.js";
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

/** Le repointage de la vitrine, enregistré. */
class RecordingRepointing extends StorefrontImageRepointing {
  readonly changes: StorefrontImageChange[] = [];

  repoint(change: StorefrontImageChange): Promise<number> {
    this.changes.push(change);
    return Promise.resolve(2);
  }
}

describe("StorefrontMediaCarriers", () => {
  it("rend les comptes de la vitrine tels quels", async () => {
    const carriers = new StorefrontMediaCarriers(
      new StubUsage(new Map([[IMAGE, 2]]), []),
      new RecordingRepointing(),
    );

    expect(await carriers.usesOf([IMAGE])).toEqual(new Map([[IMAGE, 2]]));
  });

  it("traduit chaque usage en porteur `storefront`, l'objet pour identifiant", async () => {
    const carriers = new StorefrontMediaCarriers(
      new StubUsage(new Map(), [{ objectId: "obj_1", label: "Tuile Noël" }]),
      new RecordingRepointing(),
    );

    expect(await carriers.carriersOf(IMAGE)).toEqual([
      { kind: "storefront", id: "obj_1", label: "Tuile Noël" },
    ]);
  });

  it("confie le repointage à la vitrine, telle quelle, et rend son compte", async () => {
    const repointing = new RecordingRepointing();
    const carriers = new StorefrontMediaCarriers(new StubUsage(new Map(), []), repointing);
    const change = { from: IMAGE, to: "https://media.test/b.png", staffId: "s", at: new Date(0) };

    expect(await carriers.repoint(change, new RecordingMediaJournal().untraced("test"))).toBe(2);
    expect(repointing.changes).toEqual([change]);
  });
});
