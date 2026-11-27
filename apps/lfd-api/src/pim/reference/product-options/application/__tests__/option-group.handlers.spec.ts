import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { UuidGenerator } from "../../../../../platform/id/uuid-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogReemission } from "../../../../shared/__tests__/catalog-emitter-doubles.js";
import { OptionGroup, type OptionGroupSnapshot } from "../../domain/entities/option-group.js";
import {
  EmptyOptionGroupNameError,
  OptionGroupNotFoundError,
} from "../../domain/errors/option-group-errors.js";
import { OptionGroupHoldersReader } from "../../domain/ports/option-group-holders.reader.js";
import { OptionGroupRepository } from "../../domain/ports/option-group.repository.js";
import { ArchiveOptionGroupCommand, ArchiveOptionGroupHandler } from "../archive-option-group.js";
import { CreateOptionGroupCommand, CreateOptionGroupHandler } from "../create-option-group.js";
import { ListOptionGroupsHandler } from "../list-option-groups.js";
import { RestoreOptionGroupCommand, RestoreOptionGroupHandler } from "../restore-option-group.js";
import { UpdateOptionGroupCommand, UpdateOptionGroupHandler } from "../update-option-group.js";

/**
 * Les gestes du référentiel des options (`plan-options-de-commande.md`,
 * § 3.1) : ils passent par l'agrégat, se journalisent, et réémettent APRÈS la
 * transaction les seules fiches qui activent le groupe ; un geste rejoué ne
 * fait rien.
 */

/** Garde des instantanés et reconstitue à chaque lecture — comme la vraie base. */
class InMemoryGroups extends OptionGroupRepository {
  readonly stored = new Map<string, OptionGroupSnapshot>();
  writes = 0;
  listAll(): Promise<OptionGroup[]> {
    return Promise.resolve([...this.stored.values()].map((row) => OptionGroup.reconstitute(row)));
  }
  findById(id: string): Promise<OptionGroup | null> {
    const row = this.stored.get(id);
    return Promise.resolve(row === undefined ? null : OptionGroup.reconstitute(row));
  }
  add(group: OptionGroup): Promise<void> {
    return this.save(group);
  }
  save(group: OptionGroup): Promise<void> {
    this.writes += 1;
    this.stored.set(group.id, group.snapshot());
    return Promise.resolve();
  }
}

/** Les fiches qui activent chaque groupe, posées par le test. */
class PostedHolders extends OptionGroupHoldersReader {
  readonly holders = new Map<string, readonly string[]>();
  productsHolding(groupId: string): Promise<readonly string[]> {
    return Promise.resolve(this.holders.get(groupId) ?? []);
  }
  countByGroup(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(
      new Map([...this.holders].map(([groupId, products]) => [groupId, products.length])),
    );
  }
}

class CountingIds extends UuidGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `grp_${String(this.count)}`;
  }
}

const NOW = new Date("2026-11-19T09:00:00.000Z");
const SLICED = { key: "tranche", label: "Tranché", audience: "both" as const };
const THIN = { key: "tranche-fin", label: "Tranché fin", audience: "pro" as const };
const TRANCHAGE = { name: "Tranchage", choices: [SLICED, THIN] };

function world() {
  const groups = new InMemoryGroups();
  const holders = new PostedHolders();
  const journal = new RecordingJournal();
  const reemission = new RecordingCatalogReemission();
  const uow = new DirectUnitOfWork();
  const clock = new FixedClock(NOW);
  const intents = new OncePerIntent(new InMemoryGestureIntentLedger(), clock);
  return {
    groups,
    holders,
    journal,
    reemission,
    create: new CreateOptionGroupHandler(groups, new CountingIds(), journal, uow, intents),
    update: new UpdateOptionGroupHandler(groups, holders, journal, clock, uow, reemission),
    archive: new ArchiveOptionGroupHandler(groups, holders, journal, clock, uow, reemission),
    restore: new RestoreOptionGroupHandler(groups, holders, journal, uow, reemission),
    list: new ListOptionGroupsHandler(groups, holders),
  };
}

const created = (w: ReturnType<typeof world>, key = "intent_1") =>
  w.create.execute(new CreateOptionGroupCommand(TRANCHAGE, "staff_1", key));

describe("CreateOptionGroupHandler", () => {
  it("ouvre le groupe, le journalise avec ses choix en service, ne réémet rien", async () => {
    const w = world();
    const id = await created(w);

    expect(w.groups.stored.get(id)?.name).toBe("Tranchage");
    expect(w.journal.types()).toEqual(["option_group.created"]);
    expect(w.journal.entries[0]?.payload).toEqual({
      subjectLabel: "Tranchage",
      name: "Tranchage",
      choices: ["Tranché", "Tranché fin"],
    });
    expect(w.reemission.productRequests).toEqual([]);
  });

  it("une même intention rejouée n'ouvre pas un second groupe", async () => {
    const w = world();
    const first = await created(w);
    const again = await created(w);

    expect(again).toBe(first);
    expect(w.groups.stored.size).toBe(1);
  });

  it("refuse un nom vide avant toute écriture", async () => {
    const w = world();
    await expect(
      w.create.execute(new CreateOptionGroupCommand({ ...TRANCHAGE, name: " " }, "staff_1", "k")),
    ).rejects.toThrow(EmptyOptionGroupNameError);
    expect(w.groups.writes).toBe(0);
    expect(w.journal.types()).toEqual([]);
  });
});

describe("UpdateOptionGroupHandler", () => {
  it("révise, journalise l'état d'après, puis réémet les fiches qui l'activent", async () => {
    const w = world();
    const id = await created(w);
    w.holders.holders.set(id, ["prd_pain", "prd_seigle"]);

    await w.update.execute(
      new UpdateOptionGroupCommand(id, { name: "Tranchage", choices: [SLICED] }),
    );

    expect(w.groups.stored.get(id)?.choices[1]).toMatchObject({
      key: "tranche-fin",
      archivedAt: NOW,
    });
    expect(w.journal.types()).toEqual(["option_group.created", "option_group.revised"]);
    expect(w.journal.entries[1]?.payload).toMatchObject({ choices: ["Tranché"] });
    expect(w.reemission.productRequests).toEqual([["prd_pain", "prd_seigle"]]);
  });

  it("rejouée à l'identique : ni écriture, ni fait, ni réémission", async () => {
    const w = world();
    const id = await created(w);
    w.holders.holders.set(id, ["prd_pain"]);
    const writes = w.groups.writes;

    await w.update.execute(new UpdateOptionGroupCommand(id, TRANCHAGE));

    expect(w.groups.writes).toBe(writes);
    expect(w.journal.types()).toEqual(["option_group.created"]);
    expect(w.reemission.productRequests).toEqual([]);
  });

  it("refuse un groupe inconnu", async () => {
    await expect(
      world().update.execute(new UpdateOptionGroupCommand("grp_absent", TRANCHAGE)),
    ).rejects.toThrow(OptionGroupNotFoundError);
  });
});

describe("ArchiveOptionGroupHandler / RestoreOptionGroupHandler", () => {
  it("archive, réémet les fiches qui l'activent ; rejouée, ne fait rien", async () => {
    const w = world();
    const id = await created(w);
    w.holders.holders.set(id, ["prd_pain"]);

    await w.archive.execute(new ArchiveOptionGroupCommand(id));
    await w.archive.execute(new ArchiveOptionGroupCommand(id));

    expect(w.groups.stored.get(id)?.archivedAt).toEqual(NOW);
    expect(w.journal.types()).toEqual(["option_group.created", "option_group.archived"]);
    expect(w.reemission.productRequests).toEqual([["prd_pain"]]);
  });

  it("restaure, réémet ; rejouée sur un groupe en service, ne fait rien", async () => {
    const w = world();
    const id = await created(w);
    w.holders.holders.set(id, ["prd_pain"]);
    await w.restore.execute(new RestoreOptionGroupCommand(id));
    expect(w.reemission.productRequests).toEqual([]);

    await w.archive.execute(new ArchiveOptionGroupCommand(id));
    await w.restore.execute(new RestoreOptionGroupCommand(id));

    expect(w.groups.stored.get(id)?.archivedAt).toBeNull();
    expect(w.journal.types()).toEqual([
      "option_group.created",
      "option_group.archived",
      "option_group.restored",
    ]);
    expect(w.reemission.productRequests).toEqual([["prd_pain"], ["prd_pain"]]);
  });
});

describe("ListOptionGroupsHandler", () => {
  it("rend chaque groupe, ses choix archivés marqués, et le nombre de fiches qui l'activent", async () => {
    const w = world();
    const id = await created(w);
    await w.update.execute(
      new UpdateOptionGroupCommand(id, { name: "Tranchage", choices: [THIN] }),
    );
    w.holders.holders.set(id, ["prd_pain", "prd_seigle"]);

    expect(await w.list.execute()).toEqual([
      {
        id,
        name: "Tranchage",
        archived: false,
        choices: [
          { key: "tranche-fin", label: "Tranché fin", audience: "pro", archived: false },
          { key: "tranche", label: "Tranché", audience: "both", archived: true },
        ],
        products: 2,
      },
    ]);
  });
});
