import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  DuplicateOperationSkuError,
  InvalidOperationScheduleError,
  OperationKeyTakenError,
  OperationNotFoundError,
  UnknownOperationSkusError,
} from "../../../domain/errors/operation-errors.js";
import { EditOperationCommand } from "../edit-operation.command.js";
import { EditOperationHandler } from "../edit-operation.handler.js";
import { PrepareOperationCommand } from "../prepare-operation.command.js";
import { PrepareOperationHandler } from "../prepare-operation.handler.js";
import { RescheduleOperationCommand } from "../reschedule-operation.command.js";
import { RescheduleOperationHandler } from "../reschedule-operation.handler.js";
import { SetOperationSelectionCommand } from "../set-operation-selection.command.js";
import { SetOperationSelectionHandler } from "../set-operation-selection.handler.js";
import {
  FixedWritingSwitch,
  InMemoryOperations,
  KnownSkus,
  noel,
  preparedNoel,
} from "./operation-doubles.js";

const NOW = new Date("2026-10-15T09:00:00.000Z");

function scene(seed = [preparedNoel()]) {
  const operations = new InMemoryOperations(seed);
  const events = new RecordingPublisher();
  const ports = [
    operations,
    new FixedWritingSwitch(true),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  ] as const;
  return { operations, events, ports };
}

describe("PrepareOperationHandler", () => {
  it("prépare, signe, journalise tout ce qu'elle dit, et rend la clé nettoyée", async () => {
    const { operations, events, ports } = scene([]);

    const key = await new PrepareOperationHandler(...ports).execute(
      new PrepareOperationCommand(noel({ key: " noel-2026 " }), "staff_1"),
    );

    expect(key).toBe("noel-2026");
    expect(operations.stored("noel-2026")).toMatchObject({
      skus: [],
      hidden: false,
      lastWrite: { by: "staff_1", at: NOW },
    });
    expect(events.factTypes()).toEqual(["catalog_operation.prepared"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "catalog_operation",
      subjectId: "noel-2026",
      payload: {
        subjectLabel: "Noël 2026",
        audience: "both",
        orderFrom: null,
        orderUntil: "2026-12-21T11:00:00.000Z",
        pickupFrom: "2026-12-20",
        pickupUntil: "2026-12-24",
      },
    });
  });

  /** Une clé ne se réemploie jamais (D9) — celle d'une opération reçue du référentiel non plus. */
  it("refuse une clé déjà prise, sans rien écrire", async () => {
    const { operations, events, ports } = scene();

    await expect(
      new PrepareOperationHandler(...ports).execute(new PrepareOperationCommand(noel(), "staff_1")),
    ).rejects.toThrow(OperationKeyTakenError);
    expect(operations.adds).toBe(0);
    expect(events.traced).toEqual([]);
  });
});

describe("EditOperationHandler", () => {
  it("journalise le diff seul, et ne réécrit rien quand rien ne change", async () => {
    const { operations, events, ports } = scene();
    const handler = new EditOperationHandler(...ports);
    const presentation = { name: { fr: "Noël" }, lede: { fr: "La bûche" }, image: null };

    await handler.execute(new EditOperationCommand("noel-2026", presentation, "staff_1"));
    await handler.execute(new EditOperationCommand("noel-2026", presentation, "staff_2"));

    expect(operations.saves).toBe(1);
    expect(operations.stored("noel-2026").lastWrite).toEqual({ by: "staff_1", at: NOW });
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      {
        subjectLabel: "Noël",
        changes: {
          name: { from: { fr: "Noël 2026" }, to: { fr: "Noël" } },
          lede: { from: null, to: { fr: "La bûche" } },
        },
      },
    ]);
  });

  it("refuse une opération inconnue", async () => {
    const { ports } = scene([]);

    await expect(
      new EditOperationHandler(...ports).execute(
        new EditOperationCommand(
          "noel-2026",
          { name: { fr: "Noël" }, lede: null, image: null },
          null,
        ),
      ),
    ).rejects.toThrow(OperationNotFoundError);
  });
});

describe("RescheduleOperationHandler", () => {
  /** « Fermer plus tôt », que la surcharge portait, est ce geste-là au commerce. */
  it("ferme la commande plus tôt, et ne journalise que la date qui a bougé, en texte", async () => {
    const { operations, events, ports } = scene();
    const earlier = new Date("2026-12-19T17:00:00.000Z");

    await new RescheduleOperationHandler(...ports).execute(
      new RescheduleOperationCommand(
        "noel-2026",
        { ...noel().schedule, orderUntil: earlier },
        "staff_1",
      ),
    );

    expect(operations.stored("noel-2026").schedule.orderUntil).toEqual(earlier);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "catalog_operation.rescheduled",
      payload: {
        changes: {
          orderUntil: { from: "2026-12-21T11:00:00.000Z", to: "2026-12-19T17:00:00.000Z" },
        },
      },
    });
  });

  it("refuse des dates qui se contredisent, sans rien écrire", async () => {
    const { operations, events, ports } = scene();

    await expect(
      new RescheduleOperationHandler(...ports).execute(
        new RescheduleOperationCommand(
          "noel-2026",
          { ...noel().schedule, pickupFrom: "2026-12-25" },
          "staff_1",
        ),
      ),
    ).rejects.toThrow(InvalidOperationScheduleError);
    expect(operations.saves).toBe(0);
    expect(events.traced).toEqual([]);
  });
});

describe("SetOperationSelectionHandler", () => {
  function selecting(known: readonly string[]) {
    const { operations, events, ports } = scene();
    const [repository, writing, clock, publisher, uow] = ports;
    const handler = new SetOperationSelectionHandler(
      repository,
      new KnownSkus(known),
      writing,
      clock,
      publisher,
      uow,
    );
    const select = (skus: readonly string[]) =>
      handler.execute(new SetOperationSelectionCommand("noel-2026", skus, "staff_1"));
    return { operations, events, select };
  }

  it("pose la sélection dans l'ordre du rayon, et journalise avant → après", async () => {
    const { operations, events, select } = selecting(["BUC-001", "GAL-002"]);

    await select(["GAL-002", "BUC-001"]);
    await select(["GAL-002", "BUC-001"]);

    expect(operations.stored("noel-2026").skus).toEqual(["GAL-002", "BUC-001"]);
    expect(operations.saves).toBe(1);
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { subjectLabel: "Noël 2026", skus: { from: [], to: ["GAL-002", "BUC-001"] } },
    ]);
  });

  it("refuse un SKU que le commerce ne connaît pas, en le nommant", async () => {
    const { operations, select } = selecting(["BUC-001"]);

    await expect(select(["BUC-001", "XXX-999"])).rejects.toThrow(UnknownOperationSkusError);
    await expect(select(["XXX-999"])).rejects.toThrow(/XXX-999/u);
    expect(operations.saves).toBe(0);
  });

  it("refuse un doublon avant même de demander au catalogue", async () => {
    const { select } = selecting([]);

    await expect(select(["BUC-001", "BUC-001"])).rejects.toThrow(DuplicateOperationSkuError);
  });
});
