import {
  OperationImageRepointing,
  type OperationImageChange,
} from "../../b2b/operations/channels/media/operation-image-repointing.js";
import {
  OperationMediaUsage,
  type OperationMediaUsageEntry,
} from "../../b2b/operations/channels/media/operation-media-usage.js";
import { MediaCarriers } from "../../media/channels/carriers/media-carriers.js";
import { RecordingMediaJournal } from "../../media/journal/__tests__/recording-media-journal.js";
import { CommerceOperationMediaCarriers } from "../commerce-operation-media-carriers.js";

const IMAGE = "https://media.test/noel.png";

class StubUsage extends OperationMediaUsage {
  constructor(
    private readonly counts: ReadonlyMap<string, number>,
    private readonly entries: readonly OperationMediaUsageEntry[],
  ) {
    super();
  }

  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.counts);
  }

  usagesOf(): Promise<readonly OperationMediaUsageEntry[]> {
    return Promise.resolve(this.entries);
  }
}

/** Garde ce qu'on lui demande de repointer, et rend le compte qu'on lui a donné. */
class RecordingRepointing extends OperationImageRepointing {
  readonly changes: OperationImageChange[] = [];

  constructor(private readonly count: number) {
    super();
  }

  repoint(change: OperationImageChange): Promise<number> {
    this.changes.push(change);
    return Promise.resolve(this.count);
  }
}

describe("CommerceOperationMediaCarriers", () => {
  it("compte les opérations du commerce, et les nomme sous leur clé", async () => {
    const carriers = new CommerceOperationMediaCarriers(
      new StubUsage(new Map([[IMAGE, 2]]), [{ operationKey: "noel", label: "Noël" }]),
      new RecordingRepointing(0),
    );

    expect(await carriers.usesOf([IMAGE])).toEqual(new Map([[IMAGE, 2]]));
    // Le lien de la médiathèque mène à `/operations/noel` : l'écran des opérations.
    expect(await carriers.carriersOf(IMAGE)).toEqual([
      { kind: "operation", id: "noel", label: "Noël" },
    ]);
  });

  /** Plus une copie qui attend un fait : le commerce est la source, il repointe dans la transaction. */
  it("REPOINTE par le canal des opérations et rend son compte", async () => {
    const repointing = new RecordingRepointing(1);
    const carriers: MediaCarriers = new CommerceOperationMediaCarriers(
      new StubUsage(new Map(), []),
      repointing,
    );
    const replacement = {
      from: IMAGE,
      to: "https://media.test/b.png",
      staffId: "s",
      at: new Date(0),
    };

    expect(await carriers.repoint(replacement, new RecordingMediaJournal().untraced("test"))).toBe(
      1,
    );
    expect(repointing.changes).toEqual([replacement]);
  });
});
