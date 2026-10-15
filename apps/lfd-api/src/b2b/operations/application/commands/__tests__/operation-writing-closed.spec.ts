import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OperationWritingClosedError } from "../../../domain/errors/operation-errors.js";
import { ArchiveOperationCommand } from "../archive-operation.command.js";
import { ArchiveOperationHandler } from "../archive-operation.handler.js";
import { ChangeOperationAudienceCommand } from "../change-operation-audience.command.js";
import { ChangeOperationAudienceHandler } from "../change-operation-audience.handler.js";
import { EditOperationCommand } from "../edit-operation.command.js";
import { EditOperationHandler } from "../edit-operation.handler.js";
import { PrepareOperationCommand } from "../prepare-operation.command.js";
import { PrepareOperationHandler } from "../prepare-operation.handler.js";
import { RescheduleOperationCommand } from "../reschedule-operation.command.js";
import { RescheduleOperationHandler } from "../reschedule-operation.handler.js";
import { SetOperationSelectionCommand } from "../set-operation-selection.command.js";
import { SetOperationSelectionHandler } from "../set-operation-selection.handler.js";
import { SetOperationVisibilityCommand } from "../set-operation-visibility.command.js";
import { SetOperationVisibilityHandler } from "../set-operation-visibility.handler.js";
import {
  FixedImageLibrary,
  FixedWritingSwitch,
  InMemoryOperations,
  KnownSkus,
  noel,
  preparedNoel,
} from "./operation-doubles.js";

/**
 * **Fermé, rien ne s'écrit** — le lot 1 se déploie avec `OPERATIONS_AT_COMMERCE`
 * fermé, et le push écrit encore les opérations : un geste du commerce qui
 * passerait serait écrasé au push suivant (plan, « Corrections après
 * vitruve »). Chacun des sept gestes refuse, AVANT toute lecture ou écriture.
 */
describe("les gestes d'écriture, interrupteur fermé", () => {
  const operations = new InMemoryOperations([preparedNoel()]);
  const events = new RecordingPublisher();
  const closed = new FixedWritingSwitch(false);
  const clock = new FixedClock(new Date("2026-10-15T09:00:00.000Z"));
  const uow = new DirectUnitOfWork();
  const ports = [operations, closed, clock, events, uow] as const;
  const library = new FixedImageLibrary([]);

  const gestures: readonly [string, () => Promise<unknown>][] = [
    [
      "préparer",
      () =>
        new PrepareOperationHandler(...ports, library).execute(
          new PrepareOperationCommand(noel({ key: "paques-2027" }), "staff_1"),
        ),
    ],
    [
      "éditer",
      () =>
        new EditOperationHandler(...ports, library).execute(
          new EditOperationCommand(
            "noel-2026",
            { name: { fr: "Noël" }, lede: null, image: null },
            "staff_1",
          ),
        ),
    ],
    [
      "redater",
      () =>
        new RescheduleOperationHandler(...ports).execute(
          new RescheduleOperationCommand("noel-2026", noel().schedule, "staff_1"),
        ),
    ],
    [
      "changer la clientèle",
      () =>
        new ChangeOperationAudienceHandler(...ports).execute(
          new ChangeOperationAudienceCommand("noel-2026", "pro", "staff_1"),
        ),
    ],
    [
      "masquer",
      () =>
        new SetOperationVisibilityHandler(...ports).execute(
          new SetOperationVisibilityCommand("noel-2026", true, "staff_1"),
        ),
    ],
    [
      "choisir la sélection",
      () =>
        new SetOperationSelectionHandler(
          operations,
          new KnownSkus(["BUC-001"]),
          closed,
          clock,
          events,
          uow,
        ).execute(new SetOperationSelectionCommand("noel-2026", ["BUC-001"], "staff_1")),
    ],
    [
      "archiver",
      () =>
        new ArchiveOperationHandler(...ports).execute(
          new ArchiveOperationCommand("noel-2026", "staff_1"),
        ),
    ],
  ];

  it.each(gestures)("refuse de %s, et n'écrit rien", async (_gesture, run) => {
    await expect(run()).rejects.toThrow(OperationWritingClosedError);

    expect(operations.adds + operations.saves).toBe(0);
    expect(events.traced).toEqual([]);
    // Fermé, la médiathèque n'est même pas interrogée (lot 2).
    expect(library.reads).toBe(0);
  });

  it("dit au staff que l'écriture ouvre à la bascule, et où préparer d'ici là", async () => {
    const prepare = gestures[0]?.[1];

    await expect(prepare?.()).rejects.toMatchObject({ code: "operations.writing_closed" });
    await expect(prepare?.()).rejects.toThrow(/ouvre à la bascule.*référentiel/u);
  });

  /** Fermé, même une clé inconnue reçoit le refus de la porte, pas un 404 : rien ne se lit. */
  it("refuse avant de chercher l'opération", async () => {
    await expect(
      new ArchiveOperationHandler(...ports).execute(new ArchiveOperationCommand("inconnue", null)),
    ).rejects.toThrow(OperationWritingClosedError);
  });
});
