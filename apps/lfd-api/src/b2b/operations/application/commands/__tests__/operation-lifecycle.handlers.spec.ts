import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OperationArchivedError } from "../../../domain/errors/operation-errors.js";
import { ArchiveOperationCommand } from "../archive-operation.command.js";
import { ArchiveOperationHandler } from "../archive-operation.handler.js";
import { ChangeOperationAudienceCommand } from "../change-operation-audience.command.js";
import { ChangeOperationAudienceHandler } from "../change-operation-audience.handler.js";
import { SetOperationVisibilityCommand } from "../set-operation-visibility.command.js";
import { SetOperationVisibilityHandler } from "../set-operation-visibility.handler.js";
import { InMemoryOperations, preparedNoel } from "./operation-doubles.js";

const NOW = new Date("2026-10-15T09:00:00.000Z");

function scene() {
  const operations = new InMemoryOperations([preparedNoel()]);
  const events = new RecordingPublisher();
  const ports = [operations, new FixedClock(NOW), events, new DirectUnitOfWork()] as const;
  return { operations, events, ports };
}

describe("ChangeOperationAudienceHandler", () => {
  /** Élargir est permis : il n'y a plus qu'un décideur (plan, « Ce que devient chaque champ »). */
  it("restreint puis élargit, un fait par geste, rien quand rien ne change", async () => {
    const { operations, events, ports } = scene();
    const handler = new ChangeOperationAudienceHandler(...ports);
    const change = (audience: string) =>
      handler.execute(new ChangeOperationAudienceCommand("noel-2026", audience, "staff_1"));

    await change("pro");
    await change("pro");
    await change("both");

    expect(operations.stored("noel-2026").audience).toBe("both");
    expect(events.traced.map((event) => event.journalFact().payload["audience"])).toEqual([
      { from: "both", to: "pro" },
      { from: "pro", to: "both" },
    ]);
  });
});

describe("SetOperationVisibilityHandler", () => {
  it("masque puis affiche — deux faits — et ne dit rien d'un geste sans effet", async () => {
    const { operations, events, ports } = scene();
    const handler = new SetOperationVisibilityHandler(...ports);
    const set = (hidden: boolean) =>
      handler.execute(new SetOperationVisibilityCommand("noel-2026", hidden, "staff_1"));

    await set(false);
    await set(true);
    expect(operations.stored("noel-2026")).toMatchObject({ hidden: true, archivedAt: null });
    await set(false);

    expect(operations.saves).toBe(2);
    expect(events.factTypes()).toEqual(["catalog_operation.hidden", "catalog_operation.shown"]);
  });
});

describe("ArchiveOperationHandler", () => {
  it("archive à l'instant du geste, signé, journalisé", async () => {
    const { operations, events, ports } = scene();

    await new ArchiveOperationHandler(...ports).execute(
      new ArchiveOperationCommand("noel-2026", "staff_1"),
    );

    expect(operations.stored("noel-2026")).toMatchObject({
      archivedAt: NOW,
      lastWrite: { by: "staff_1", at: NOW },
    });
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "catalog_operation.archived",
      subjectType: "catalog_operation",
      subjectId: "noel-2026",
      payload: { subjectLabel: "Noël 2026" },
    });
  });

  /** Un second archivage écraserait la date du premier, qui est celle qu'on cherchera. */
  it("refuse d'archiver deux fois, et refuse ensuite tout geste", async () => {
    const { ports } = scene();
    await new ArchiveOperationHandler(...ports).execute(
      new ArchiveOperationCommand("noel-2026", null),
    );

    await expect(
      new ArchiveOperationHandler(...ports).execute(new ArchiveOperationCommand("noel-2026", null)),
    ).rejects.toThrow(OperationArchivedError);
    await expect(
      new SetOperationVisibilityHandler(...ports).execute(
        new SetOperationVisibilityCommand("noel-2026", true, null),
      ),
    ).rejects.toThrow(OperationArchivedError);
  });
});
