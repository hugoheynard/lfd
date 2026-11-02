import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import {
  ArrestedPlanHold,
  type PlanHoldState,
} from "../../../production/channels/packing/index.js";
import type { PackingResupply } from "../../domain/entities/packing-resupply.js";
import type { PackingSheet, PackingSheetSnapshot } from "../../domain/entities/packing-sheet.js";
import { EmptyProposalError } from "../../domain/errors/packing-container-errors.js";
import { PackingPlanReopenedError } from "../../domain/errors/packing-plan-errors.js";
import { AllocateToContainerCommand } from "../containers/allocate-to-container.command.js";
import { AllocateToContainerHandler } from "../containers/allocate-to-container.handler.js";
import { ApplyPackingProposalCommand } from "../containers/apply-packing-proposal.command.js";
import { ApplyPackingProposalHandler } from "../containers/apply-packing-proposal.handler.js";
import { OpenPackingContainerCommand } from "../containers/open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../containers/open-packing-container.handler.js";
import { ClosePackingResupplyCommand } from "../resupplies/close-packing-resupply.command.js";
import { ClosePackingResupplyHandler } from "../resupplies/close-packing-resupply.handler.js";
import { EnterPackedResupplyLineCommand } from "../resupplies/enter-packed-resupply-line.command.js";
import { EnterPackedResupplyLineHandler } from "../resupplies/enter-packed-resupply-line.handler.js";
import { ClosePackingOrderCommand } from "../station/close-packing-order.command.js";
import { ClosePackingOrderHandler } from "../station/close-packing-order.handler.js";
import { ScriptedBinDesk } from "./bin-desk-double.js";
import { InMemoryPackingSettings } from "./packing-settings-doubles.js";
import { InMemoryResupplies, InMemoryResupplyRepository } from "./resupply-doubles.js";
import { InMemoryShadow } from "./shadow-doubles.js";
import { InMemorySheets, InMemoryStocks, RecordingDurable } from "./station-doubles.js";

/**
 * **Chaque geste qui fait « commencer » le colisage tient le plan arrêté
 * AVANT d'écrire** (audit du réassort, 2026-11-02). Le verrou partagé n'a de
 * sens que pris le premier : pris après une écriture, la réouverture
 * validée entre les deux ne le verrait pas.
 */

// Un jour et des instants comparés entre eux, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(1_000);
const STAFF = "staff_1";

/** Le journal partagé des appels : l'ordre est le sujet. */
type Log = string[];

class LoggedHold extends ArrestedPlanHold {
  constructor(
    private readonly log: Log,
    private readonly state: PlanHoldState,
  ) {
    super();
  }

  hold(serviceDay: string): Promise<PlanHoldState> {
    this.log.push(`hold ${serviceDay}`);
    return Promise.resolve(this.state);
  }
}

class LoggedSheets extends InMemorySheets {
  constructor(private readonly log: Log) {
    super();
  }

  override lock(serviceDay: string, orderId: string, rank: number): Promise<PackingSheet | null> {
    this.log.push("sheet.lock");
    return super.lock(serviceDay, orderId, rank);
  }

  override save(sheet: PackingSheet): Promise<void> {
    this.log.push("sheet.save");
    return super.save(sheet);
  }
}

class LoggedResupplies extends InMemoryResupplyRepository {
  constructor(
    table: InMemoryResupplies,
    private readonly log: Log,
  ) {
    super(table);
  }

  override lock(serviceDay: string, resupplyId: string): Promise<PackingResupply | null> {
    this.log.push("resupply.lock");
    return super.lock(serviceDay, resupplyId);
  }

  override save(sheet: PackingResupply): Promise<void> {
    this.log.push("resupply.save");
    return super.save(sheet);
  }
}

function snapshot(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null, saleUnit: "piece" }],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    ...overrides,
  };
}

/** Un sac ouvert et la ligne entièrement répartie dedans. */
function filled(): PackingSheetSnapshot {
  return snapshot({
    containers: 1,
    lines: [
      {
        sku: "CRO",
        productName: "Croissant",
        quantity: 4,
        packed: { at: AT, by: STAFF, initials: "" },
        saleUnit: "piece",
      },
    ],
    containerList: [
      {
        id: "ctn_1",
        nature: "bag",
        bin: null,
        opened: { at: AT, by: STAFF },
        voided: null,
        lines: [{ sku: "CRO", quantity: 4 }],
      },
    ],
  });
}

/** Un sac ouvert, vide. */
function withEmptyBag(): PackingSheetSnapshot {
  return snapshot({
    containers: 1,
    containerList: [
      {
        id: "ctn_1",
        nature: "bag",
        bin: null,
        opened: { at: AT, by: STAFF },
        voided: null,
        lines: [],
      },
    ],
  });
}

function sheetGestures(state: PlanHoldState, row: PackingSheetSnapshot) {
  const log: Log = [];
  const sheets = new LoggedSheets(log);
  sheets.put(row);
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 20, returned: 0 });
  const stocks = new InMemoryStocks(shadow);
  const desk = new ScriptedBinDesk();
  const clock = new FixedClock(AT);
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const hold = new LoggedHold(log, state);
  const ids = new FixedIdGenerator("ctn");
  return {
    log,
    sheets,
    open: new OpenPackingContainerHandler(
      sheets,
      desk,
      ids,
      clock,
      events,
      uow,
      InMemoryPackingSettings.sharingOpen().reader(),
      hold,
    ),
    allocate: new AllocateToContainerHandler(sheets, stocks, desk, clock, events, uow, hold),
    apply: new ApplyPackingProposalHandler(sheets, stocks, desk, ids, clock, events, uow, hold),
    close: new ClosePackingOrderHandler(sheets, new RecordingDurable(), clock, uow, hold),
  };
}

async function resupplyGestures(state: PlanHoldState) {
  const log: Log = [];
  const table = new InMemoryResupplies();
  await table.draw({
    serviceDay: DAY,
    resupplyId: "rs_1",
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    kind: "evening",
    drawnAt: AT,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, saleUnit: "piece" }],
  });
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: 20, returned: 0 });
  const stocks = new InMemoryStocks(shadow);
  const repository = new LoggedResupplies(table, log);
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  const hold = new LoggedHold(log, state);
  return {
    log,
    table,
    enter: new EnterPackedResupplyLineHandler(repository, stocks, clock, uow, hold),
    close: new ClosePackingResupplyHandler(repository, stocks, clock, uow, hold),
  };
}

describe("Les gestes du colisage tiennent le plan arrêté, d'abord", () => {
  it("ouvrir un sac : le plan tenu avant le verrou du bac et son écriture", async () => {
    const { log, open } = sheetGestures("arrested", snapshot());

    await open.execute(new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF));

    expect(log).toEqual([`hold ${DAY}`, "sheet.lock", "sheet.save"]);
  });

  it("mettre au bac : le plan tenu avant le verrou du bac et son écriture", async () => {
    const { log, allocate } = sheetGestures("arrested", withEmptyBag());

    await allocate.execute(new AllocateToContainerCommand(DAY, "ord_1", "ctn_1", "CRO", 4, STAFF));

    expect(log).toEqual([`hold ${DAY}`, "sheet.lock", "sheet.save"]);
  });

  it("appliquer la proposition : le plan tenu avant le verrou du bac", async () => {
    const { log, apply } = sheetGestures("arrested", snapshot());

    // Proposition vide : le refus vient du bac, APRÈS le plan tenu.
    await expect(
      apply.execute(new ApplyPackingProposalCommand(DAY, "ord_1", STAFF)),
    ).rejects.toThrow(EmptyProposalError);

    expect(log).toEqual([`hold ${DAY}`, "sheet.lock"]);
  });

  it("fermer le bac : le plan tenu avant le verrou du bac et son écriture", async () => {
    const { log, close } = sheetGestures("arrested", filled());

    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", STAFF));

    expect(log).toEqual([`hold ${DAY}`, "sheet.lock", "sheet.save"]);
  });

  it("saisir puis clore une fiche de réassort : le plan tenu à chaque geste, d'abord", async () => {
    const { log, enter, close } = await resupplyGestures("arrested");

    await enter.execute(new EnterPackedResupplyLineCommand(DAY, "rs_1", "CRO", 4, STAFF));
    await close.execute(new ClosePackingResupplyCommand(DAY, "rs_1", STAFF));

    expect(log).toEqual([
      `hold ${DAY}`,
      "resupply.lock",
      "resupply.save",
      `hold ${DAY}`,
      "resupply.lock",
      "resupply.save",
    ]);
  });
});

describe("Un plan rouvert : chaque geste refuse sans rien verrouiller ni écrire", () => {
  const sheetCases = [
    {
      name: "ouvrir un sac",
      row: snapshot(),
      run: (g: ReturnType<typeof sheetGestures>) =>
        g.open.execute(new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF)),
    },
    {
      name: "mettre au bac",
      row: withEmptyBag(),
      run: (g: ReturnType<typeof sheetGestures>) =>
        g.allocate.execute(new AllocateToContainerCommand(DAY, "ord_1", "ctn_1", "CRO", 4, STAFF)),
    },
    {
      name: "appliquer la proposition",
      row: snapshot(),
      run: (g: ReturnType<typeof sheetGestures>) =>
        g.apply.execute(new ApplyPackingProposalCommand(DAY, "ord_1", STAFF)),
    },
    {
      name: "fermer le bac",
      row: filled(),
      run: (g: ReturnType<typeof sheetGestures>) =>
        g.close.execute(new ClosePackingOrderCommand(DAY, "ord_1", STAFF)),
    },
  ];

  it.each(sheetCases)("$name", async ({ row, run }) => {
    const gestures = sheetGestures("reopened", row);

    await expect(run(gestures)).rejects.toThrow(PackingPlanReopenedError);

    expect(gestures.log).toEqual([`hold ${DAY}`]);
    expect(gestures.sheets.of(DAY, "ord_1")).toEqual(row);
  });

  it("saisir une ligne de réassort", async () => {
    const { log, table, enter } = await resupplyGestures("reopened");
    const before = table.rows.get(`${DAY}/rs_1`);

    await expect(
      enter.execute(new EnterPackedResupplyLineCommand(DAY, "rs_1", "CRO", 4, STAFF)),
    ).rejects.toThrow(PackingPlanReopenedError);

    expect(log).toEqual([`hold ${DAY}`]);
    expect(table.rows.get(`${DAY}/rs_1`)).toBe(before);
  });

  it("clore une fiche de réassort — le refus nomme la journée et le geste de sortie", async () => {
    const { log, close } = await resupplyGestures("reopened");

    await expect(
      close.execute(new ClosePackingResupplyCommand(DAY, "rs_1", STAFF)),
    ).rejects.toThrow(/a été rouvert.*Réarrêtez la journée/);

    expect(log).toEqual([`hold ${DAY}`]);
  });

  it("une journée jamais arrêtée : le colisage refuse aussi, il n'y a pas de plan sous le geste", async () => {
    const { log, open } = sheetGestures("never_arrested", snapshot());

    await expect(
      open.execute(new OpenPackingContainerCommand(DAY, "ord_1", { nature: "bag" }, STAFF)),
    ).rejects.toThrow(PackingPlanReopenedError);

    expect(log).toEqual([`hold ${DAY}`]);
  });
});
