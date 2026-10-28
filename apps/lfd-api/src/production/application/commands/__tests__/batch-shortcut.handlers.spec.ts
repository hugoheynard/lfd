import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  BatchShortcutNotFoundError,
  DuplicateBatchShortcutLabelError,
  TooManyBatchShortcutsError,
} from "../../../domain/errors/batch-shortcut-errors.js";
import { InMemoryBatchShortcuts, shortcutRow } from "../../__tests__/batch-shortcut-doubles.js";
import { CreateBatchShortcutCommand } from "../create-batch-shortcut.command.js";
import { CreateBatchShortcutHandler } from "../create-batch-shortcut.handler.js";
import { RemoveBatchShortcutCommand } from "../remove-batch-shortcut.command.js";
import { RemoveBatchShortcutHandler } from "../remove-batch-shortcut.handler.js";
import { UpdateBatchShortcutCommand } from "../update-batch-shortcut.command.js";
import { UpdateBatchShortcutHandler } from "../update-batch-shortcut.handler.js";

/** Réglages › Production › Raccourcis (plan des raccourcis, S1), ports doublés. */
function subject() {
  const clock = new FixedClock(new Date());
  const table = new InMemoryBatchShortcuts();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
  );
  return {
    clock,
    table,
    events,
    create: new CreateBatchShortcutHandler(
      table,
      authors,
      events,
      new FixedIdGenerator("bs"),
      clock,
      uow,
    ),
    update: new UpdateBatchShortcutHandler(table, events, clock, uow),
    remove: new RemoveBatchShortcutHandler(table, events, clock, uow),
  };
}

describe("CreateBatchShortcutHandler", () => {
  it("ajoute le raccourci, fige l'auteur, rend son id et le journalise", async () => {
    const { create, table, events, clock } = subject();

    const id = await create.execute(
      new CreateBatchShortcutCommand("VIE-001", " 1 plaque ", 24, "staff-1"),
    );

    expect(id).toBe("bs_000001");
    expect(table.rows.get(id)).toMatchObject({
      sku: "VIE-001",
      label: "1 plaque",
      pieces: 24,
      position: 0,
      createdBy: { staffUserId: "staff-1", name: "Marie Dupont" },
      createdAt: clock.now(),
      removedAt: null,
    });
    expect(events.factTypes()).toEqual(["production_batch_shortcut.created"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_batch_shortcut",
      subjectId: id,
      payload: {
        subjectLabel: "1 plaque (VIE-001)",
        sku: "VIE-001",
        label: "1 plaque",
        pieces: 24,
      },
    });
  });

  it("une fiche sans nom laisse le nom vide : on n'en invente pas", async () => {
    const { create, table } = subject();

    const id = await create.execute(new CreateBatchShortcutCommand("VIE-001", "1 plaque", 24, "x"));

    expect(table.rows.get(id)?.createdBy).toEqual({ staffUserId: "x", name: null });
  });

  it("refuse un doublon de nom sans rien écrire ni journaliser", async () => {
    const { create, table, events } = subject();
    table.seed(shortcutRow());

    await expect(
      create.execute(new CreateBatchShortcutCommand("VIE-001", "1 PLAQUE", 12, "staff-1")),
    ).rejects.toThrow(DuplicateBatchShortcutLabelError);
    expect(table.saves).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse le septième raccourci d'un produit, mais pas le premier d'un autre", async () => {
    const { create, table } = subject();
    table.seed(
      ...[0, 1, 2, 3, 4, 5].map((index) =>
        shortcutRow({ id: `s${index}`, label: `${index} plaques`, position: index }),
      ),
    );

    await expect(
      create.execute(new CreateBatchShortcutCommand("VIE-001", "1 chariot", 96, "staff-1")),
    ).rejects.toThrow(TooManyBatchShortcutsError);
    await expect(
      create.execute(new CreateBatchShortcutCommand("PAI-001", "1 chariot", 96, "staff-1")),
    ).resolves.toBe("bs_000002");
  });
});

describe("UpdateBatchShortcutHandler", () => {
  it("modifie le nom et les pièces, et journalise l'avant", async () => {
    const { update, table, events, clock } = subject();
    table.seed(shortcutRow());

    await update.execute(new UpdateBatchShortcutCommand("bs-1", "1 grande plaque", 30));

    expect(table.rows.get("bs-1")).toMatchObject({
      label: "1 grande plaque",
      pieces: 30,
      updatedAt: clock.now(),
    });
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "production_batch_shortcut.updated",
      payload: {
        label: "1 grande plaque",
        pieces: 30,
        previous: { label: "1 plaque", pieces: 24 },
      },
    });
  });

  it("reposer le même état n'écrit ni ne journalise rien", async () => {
    const { update, table, events } = subject();
    table.seed(shortcutRow());

    await update.execute(new UpdateBatchShortcutCommand("bs-1", "1 plaque", 24));

    expect(table.saves).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("404 sur un raccourci supprimé", async () => {
    const { update, table } = subject();
    table.seed(shortcutRow({ removedAt: new Date(Date.UTC(2000, 0, 2)) }));

    await expect(
      update.execute(new UpdateBatchShortcutCommand("bs-1", "1 plaque", 12)),
    ).rejects.toThrow(BatchShortcutNotFoundError);
  });
});

describe("RemoveBatchShortcutHandler", () => {
  it("archive la ligne et journalise le retrait", async () => {
    const { remove, table, events, clock } = subject();
    table.seed(shortcutRow());

    await remove.execute(new RemoveBatchShortcutCommand("bs-1"));

    expect(table.rows.get("bs-1")?.removedAt).toEqual(clock.now());
    expect(events.factTypes()).toEqual(["production_batch_shortcut.removed"]);
  });

  it("404 sur un raccourci inconnu, sans rien écrire", async () => {
    const { remove, table, events } = subject();

    await expect(remove.execute(new RemoveBatchShortcutCommand("nope"))).rejects.toThrow(
      BatchShortcutNotFoundError,
    );
    expect(table.saves).toBe(0);
    expect(events.traced).toEqual([]);
  });
});
