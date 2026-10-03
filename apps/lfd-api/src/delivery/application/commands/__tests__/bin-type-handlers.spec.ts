import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  BinInnerExceedsOuterError,
  BinTypeArchivedForCapacityError,
  BinTypeNameTakenError,
  BinTypeNotFoundError,
  InvalidBinCapacityError,
} from "../../../domain/errors/delivery-bin-errors.js";
import { AddBinTypeCommand } from "../add-bin-type.command.js";
import { AddBinTypeHandler } from "../add-bin-type.handler.js";
import { ArchiveBinTypeCommand } from "../archive-bin-type.command.js";
import { ArchiveBinTypeHandler } from "../archive-bin-type.handler.js";
import { CorrectBinTypeCommand } from "../correct-bin-type.command.js";
import { CorrectBinTypeHandler } from "../correct-bin-type.handler.js";
import { ReactivateBinTypeCommand } from "../reactivate-bin-type.command.js";
import { ReactivateBinTypeHandler } from "../reactivate-bin-type.handler.js";
import { SetBinCapacityCommand } from "../set-bin-capacity.command.js";
import { SetBinCapacityHandler } from "../set-bin-capacity.handler.js";
import {
  ActiveBinTypesOver,
  binType,
  CREATED,
  InMemoryBinCapacities,
  InMemoryBinTypes,
  SPEC,
} from "./bin-doubles.js";

const NOW = new Date(CREATED.getTime() + 3_600_000);

function tools(): { clock: FixedClock; events: RecordingPublisher; uow: DirectUnitOfWork } {
  return {
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("AddBinTypeHandler", () => {
  it("fait entrer le type, id du générateur, et le trace", async () => {
    const types = new InMemoryBinTypes();
    const { clock, events, uow } = tools();
    const handler = new AddBinTypeHandler(types, new FixedIdGenerator("bin"), clock, events, uow);

    const id = await handler.execute(new AddBinTypeCommand(SPEC));

    expect(id).toBe("bin_000001");
    expect(types.saved[0]?.toState()).toMatchObject({ ...SPEC, createdAt: NOW });
    expect(events.factTypes()).toEqual(["delivery_bin_type.added"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "delivery_bin_type",
      subjectId: "bin_000001",
      payload: { subjectLabel: "Bac M", bin: SPEC },
    });
  });

  it("refuse un nom déjà porté par un type en service, sans rien écrire", async () => {
    const types = new InMemoryBinTypes(binType("bin_a", "Bac M"));
    const { clock, events, uow } = tools();
    const handler = new AddBinTypeHandler(types, new FixedIdGenerator(), clock, events, uow);

    await expect(handler.execute(new AddBinTypeCommand(SPEC))).rejects.toThrow(
      BinTypeNameTakenError,
    );
    expect(types.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("reprend le nom d'un type archivé", async () => {
    const old = binType("bin_a", "Bac M");
    old.archive(CREATED);
    const types = new InMemoryBinTypes(old);
    const { clock, events, uow } = tools();
    const handler = new AddBinTypeHandler(types, new FixedIdGenerator(), clock, events, uow);

    await handler.execute(new AddBinTypeCommand(SPEC));

    expect(types.saved).toHaveLength(1);
  });

  it("refuse un intérieur plus grand que l'extérieur", async () => {
    const types = new InMemoryBinTypes();
    const { clock, events, uow } = tools();
    const handler = new AddBinTypeHandler(types, new FixedIdGenerator(), clock, events, uow);

    await expect(
      handler.execute(new AddBinTypeCommand({ ...SPEC, inner: { ...SPEC.inner, widthCm: 41 } })),
    ).rejects.toThrow(BinInnerExceedsOuterError);
  });
});

describe("CorrectBinTypeHandler", () => {
  it("corrige la fiche et trace l'avant et l'après", async () => {
    const types = new InMemoryBinTypes(binType("bin_a", "Bac M"));
    const { clock, events, uow } = tools();
    const handler = new CorrectBinTypeHandler(types, clock, events, uow);

    await handler.execute(
      new CorrectBinTypeCommand("bin_a", { ...SPEC, name: "Bac M iso", isotherm: true }),
    );

    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Bac M iso",
      before: SPEC,
      after: { ...SPEC, name: "Bac M iso", isotherm: true },
    });
  });

  it("refuse de prendre le nom d'un autre type en service", async () => {
    const types = new InMemoryBinTypes(binType("bin_a", "Bac M"), binType("bin_b", "Bac L"));
    const { clock, events, uow } = tools();
    const handler = new CorrectBinTypeHandler(types, clock, events, uow);

    await expect(handler.execute(new CorrectBinTypeCommand("bin_b", SPEC))).rejects.toThrow(
      "Un type de bac s'appelle déjà « Bac M »",
    );
  });

  it("garde son propre nom sans se refuser", async () => {
    const types = new InMemoryBinTypes(binType("bin_a", "Bac M"));
    const { clock, events, uow } = tools();

    await new CorrectBinTypeHandler(types, clock, events, uow).execute(
      new CorrectBinTypeCommand("bin_a", { ...SPEC, maxStack: 8 }),
    );

    expect(types.saved[0]?.maxStack).toBe(8);
  });

  it("refuse un type inconnu", async () => {
    const { clock, events, uow } = tools();
    await expect(
      new CorrectBinTypeHandler(new InMemoryBinTypes(), clock, events, uow).execute(
        new CorrectBinTypeCommand("nope", SPEC),
      ),
    ).rejects.toThrow(BinTypeNotFoundError);
  });
});

describe("ArchiveBinTypeHandler / ReactivateBinTypeHandler", () => {
  it("archive daté du Clock, puis réactive, chacun tracé", async () => {
    // Un autre type reste en service : archiver bin_a ne défait pas le socle (CA-D3).
    const types = new InMemoryBinTypes(binType("bin_a", "Bac M"), binType("bin_b", "Bac L"));
    const { clock, events, uow } = tools();

    await new ArchiveBinTypeHandler(
      types,
      new ActiveBinTypesOver(types),
      clock,
      events,
      uow,
    ).execute(new ArchiveBinTypeCommand("bin_a"));
    expect(types.saved[0]?.archivedAt).toEqual(NOW);

    await new ReactivateBinTypeHandler(types, clock, events, uow).execute(
      new ReactivateBinTypeCommand("bin_a"),
    );
    expect(types.saved[1]?.archivedAt).toBeNull();
    expect(events.factTypes()).toEqual([
      "delivery_bin_type.archived",
      "delivery_bin_type.reactivated",
    ]);
  });

  it("refuse de réactiver un type dont le nom a été repris entre-temps", async () => {
    const old = binType("bin_a", "Bac M");
    old.archive(CREATED);
    const types = new InMemoryBinTypes(old, binType("bin_b", "Bac M"));
    const { clock, events, uow } = tools();

    await expect(
      new ReactivateBinTypeHandler(types, clock, events, uow).execute(
        new ReactivateBinTypeCommand("bin_a"),
      ),
    ).rejects.toThrow(BinTypeNameTakenError);
    expect(types.saved).toHaveLength(0);
  });
});

describe("SetBinCapacityHandler", () => {
  function handlerWith(
    types: InMemoryBinTypes,
    capacities: InMemoryBinCapacities,
  ): { handler: SetBinCapacityHandler; events: RecordingPublisher } {
    const { clock, events, uow } = tools();
    return { handler: new SetBinCapacityHandler(types, capacities, clock, events, uow), events };
  }

  it("pose une contenance, puis la change, puis la retire — chaque geste tracé avec l'avant", async () => {
    const capacities = new InMemoryBinCapacities();
    const { handler, events } = handlerWith(
      new InMemoryBinTypes(binType("bin_a", "Bac M")),
      capacities,
    );

    await handler.execute(
      new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-001", units: 24 }),
    );
    await handler.execute(
      new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-001", units: 30 }),
    );
    await handler.execute(
      new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-001", units: null }),
    );

    expect(capacities.cells.size).toBe(0);
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { subjectLabel: "Bac M", sku: "VIE-001", before: null, after: 24 },
      { subjectLabel: "Bac M", sku: "VIE-001", before: 24, after: 30 },
      { subjectLabel: "Bac M", sku: "VIE-001", before: 30, after: null },
    ]);
    expect(events.factTypes()).toEqual([
      "delivery_bin_capacity.set",
      "delivery_bin_capacity.set",
      "delivery_bin_capacity.set",
    ]);
  });

  it("n'écrit ni ne trace une case inchangée", async () => {
    const capacities = new InMemoryBinCapacities();
    capacities.cells.set("bin_a|VIE-001", 24);
    const { handler, events } = handlerWith(
      new InMemoryBinTypes(binType("bin_a", "Bac M")),
      capacities,
    );

    await handler.execute(
      new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-001", units: 24 }),
    );
    await handler.execute(
      new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "PAIN-9", units: null }),
    );

    expect(capacities.writes).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse une contenance hors bornes avant toute écriture", async () => {
    const capacities = new InMemoryBinCapacities();
    const { handler } = handlerWith(new InMemoryBinTypes(binType("bin_a", "Bac M")), capacities);

    await expect(
      handler.execute(new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-001", units: 0 })),
    ).rejects.toThrow(InvalidBinCapacityError);
    expect(capacities.writes).toEqual([]);
  });

  it("refuse de poser sur un type archivé, mais permet d'y vider une case", async () => {
    const archived = binType("bin_a", "Bac M");
    archived.archive(CREATED);
    const capacities = new InMemoryBinCapacities();
    capacities.cells.set("bin_a|VIE-001", 24);
    const { handler } = handlerWith(new InMemoryBinTypes(archived), capacities);

    await expect(
      handler.execute(new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-002", units: 5 })),
    ).rejects.toThrow(BinTypeArchivedForCapacityError);
    await handler.execute(
      new SetBinCapacityCommand({ binTypeId: "bin_a", sku: "VIE-001", units: null }),
    );

    expect(capacities.writes).toEqual(["remove bin_a|VIE-001"]);
  });

  it("refuse un type inconnu", async () => {
    const { handler } = handlerWith(new InMemoryBinTypes(), new InMemoryBinCapacities());
    await expect(
      handler.execute(new SetBinCapacityCommand({ binTypeId: "nope", sku: "VIE-001", units: 3 })),
    ).rejects.toThrow(BinTypeNotFoundError);
  });
});
