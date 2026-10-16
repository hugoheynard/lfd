import {
  ReferentialOperations,
  type ReferentialOperation,
} from "../../../../../pim/channels/b2b-platform/operations/referential-operations.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Operation } from "../../../domain/entities/operation.js";
import {
  OperationsMigrationBlockedError,
  OperationWritingClosedError,
} from "../../../domain/errors/operation-errors.js";
import type { MigrationRestriction } from "../../../domain/services/operation-migration.js";
import { PreviewOperationsMigrationHandler } from "../../queries/preview-operations-migration.handler.js";
import { ApplyOperationsMigrationCommand } from "../apply-operations-migration.command.js";
import { ApplyOperationsMigrationHandler } from "../apply-operations-migration.handler.js";
import {
  FixedImageLibrary,
  FixedWritingSwitch,
  InMemoryAdoption,
  InMemoryOperations,
  KnownSkus,
  libraryImage,
  MirrorOfOperations,
  noel,
  recordOf,
} from "./operation-doubles.js";

/** Le référentiel, tel que son canal le rend. */
class ReferentialTable extends ReferentialOperations {
  constructor(private readonly operations: readonly ReferentialOperation[]) {
    super();
  }

  list(): Promise<readonly ReferentialOperation[]> {
    return Promise.resolve(this.operations);
  }
}

const NOW = new Date("2026-10-16T08:00:00.000Z");
const IMAGE = "https://media.test/buche.webp";
const SCHEDULE = noel().schedule;

function pim(over: Partial<ReferentialOperation> = {}): ReferentialOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël 2026" },
    lede: null,
    image: { url: IMAGE },
    announceFrom: SCHEDULE.announceFrom,
    orderFrom: SCHEDULE.orderFrom,
    orderUntil: SCHEDULE.orderUntil,
    pickupFrom: SCHEDULE.pickupFrom,
    pickupUntil: SCHEDULE.pickupUntil,
    audience: "both",
    skus: ["BUC-001-1", "GAL-002-1"],
    archivedAt: null,
    ...over,
  };
}

/** La copie que le dernier envoi a écrite : jamais écrite au commerce. */
function copyOf(operation: ReferentialOperation): Operation {
  return Operation.reconstitute({
    key: operation.key,
    showsOrderUntilTime: true,
    name: operation.name,
    lede: operation.lede,
    image: operation.image,
    schedule: {
      announceFrom: operation.announceFrom,
      orderFrom: operation.orderFrom,
      orderUntil: operation.orderUntil,
      pickupFrom: operation.pickupFrom,
      pickupUntil: operation.pickupUntil,
    },
    audience: operation.audience,
    skus: operation.skus,
    hidden: false,
    archivedAt: operation.archivedAt,
    lastWrite: null,
  });
}

const RESTRICTION: MigrationRestriction = {
  isHidden: false,
  orderUntil: null,
  audience: "pro",
  hiddenSkus: ["GAL-002-1"],
  decidedBy: "staff_reception",
  decidedAt: new Date("2026-10-10T09:00:00.000Z"),
};

function scene(options: {
  readonly referential: readonly ReferentialOperation[];
  readonly mirror: readonly Operation[];
  readonly restrictions?: ReadonlyMap<string, MigrationRestriction>;
  readonly open?: boolean;
}) {
  const operations = new InMemoryOperations(options.mirror);
  const adoption = new InMemoryAdoption(operations);
  const events = new RecordingPublisher();
  const readers = [
    new ReferentialTable(options.referential),
    new MirrorOfOperations(operations, options.restrictions),
    new KnownSkus(["BUC-001-1", "GAL-002-1"]),
    new FixedImageLibrary([libraryImage(IMAGE, { x: 0.4, y: 0.6 })]),
  ] as const;
  const apply = new ApplyOperationsMigrationHandler(
    ...readers,
    operations,
    adoption,
    new FixedWritingSwitch(options.open ?? true),
    events,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  const preview = new PreviewOperationsMigrationHandler(...readers, new FixedClock(NOW));
  return { operations, adoption, events, apply, preview };
}

const migrate = (by = "staff_hugo") => new ApplyOperationsMigrationCommand(by);

describe("ApplyOperationsMigrationHandler", () => {
  it("interrupteur fermé : refuse avant toute lecture, rien d'écrit", async () => {
    const { apply, adoption } = scene({ referential: [pim()], mirror: [], open: false });

    await expect(apply.execute(migrate())).rejects.toThrow(OperationWritingClosedError);
    expect(adoption.adopted).toEqual([]);
  });

  it("verse la surcharge dans l'opération, signe, et trace qui avait restreint quoi", async () => {
    const { apply, operations, events } = scene({
      referential: [pim()],
      mirror: [copyOf(pim())],
      restrictions: new Map([["noel-2026", RESTRICTION]]),
    });

    await apply.execute(migrate());

    expect(operations.stored("noel-2026")).toMatchObject({
      audience: "pro",
      skus: ["BUC-001-1"],
      hidden: false,
      image: { url: IMAGE, focal: { x: 0.4, y: 0.6 } },
      lastWrite: { by: "staff_hugo", at: NOW },
    });
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "catalog_operation.restriction_carried_over",
        subjectType: "catalog_operation",
        subjectId: "noel-2026",
        payload: {
          subjectLabel: "Noël 2026",
          decidedBy: "staff_reception",
          decidedAt: "2026-10-10T09:00:00.000Z",
          isHidden: false,
          orderUntil: null,
          audience: "pro",
          hiddenSkus: ["GAL-002-1"],
        },
      },
    ]);
  });

  it("crée celle qui n'avait jamais été envoyée, sans fait : rien n'était restreint", async () => {
    const { apply, operations, events } = scene({ referential: [pim()], mirror: [] });

    await apply.execute(migrate());

    expect(operations.stored("noel-2026").lastWrite).toEqual({ by: "staff_hugo", at: NOW });
    expect(events.traced).toEqual([]);
  });

  it("est rejouable : la seconde fois n'écrit rien, et le relevé dit « déjà au commerce »", async () => {
    const { apply, preview, adoption, events } = scene({
      referential: [pim()],
      mirror: [copyOf(pim())],
      restrictions: new Map([["noel-2026", RESTRICTION]]),
    });
    await apply.execute(migrate());

    await apply.execute(migrate("staff_autre"));

    expect(adoption.adopted).toEqual(["noel-2026"]);
    expect(events.traced).toHaveLength(1);
    const report = await preview.execute();
    expect(report.counts).toMatchObject({ toWrite: 0, alreadyAtCommerce: 1, restrictions: 1 });
  });

  it("une ligne bloquée : rien n'est écrit, pas même les autres", async () => {
    const closesTooEarly = { ...RESTRICTION, orderUntil: new Date("2026-10-01T00:00:00.000Z") };
    const { apply, adoption } = scene({
      referential: [pim(), pim({ key: "galette-2027" })],
      mirror: [copyOf(pim())],
      restrictions: new Map([["noel-2026", closesTooEarly]]),
    });

    await expect(apply.execute(migrate())).rejects.toThrow(OperationsMigrationBlockedError);
    expect(adoption.adopted).toEqual([]);
  });
});

describe("PreviewOperationsMigrationHandler", () => {
  it("compte et compare sans rien écrire", async () => {
    const { preview, adoption, operations } = scene({
      referential: [pim(), pim({ key: "galette-2027" })],
      mirror: [copyOf(pim())],
      restrictions: new Map([["noel-2026", RESTRICTION]]),
    });
    const before = recordOf(operations.rows.get("noel-2026") ?? copyOf(pim()));

    const report = await preview.execute();

    expect(report).toMatchObject({
      readAt: NOW.toISOString(),
      blocked: false,
      counts: { referential: 2, mirror: 1, restrictions: 1, toWrite: 2, blocked: 0 },
    });
    expect(report.operations.map((line) => [line.key, line.outcome])).toEqual([
      ["noel-2026", "adopt"],
      ["galette-2027", "create"],
    ]);
    expect(adoption.adopted).toEqual([]);
    expect(recordOf(operations.rows.get("noel-2026") ?? copyOf(pim()))).toEqual(before);
  });
});
