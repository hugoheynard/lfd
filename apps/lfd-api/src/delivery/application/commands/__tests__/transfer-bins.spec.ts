import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryBin } from "../../../domain/entities/delivery-bin.js";
import type { StopLoadingSnapshot } from "../../../domain/entities/stop-loading.js";
import {
  DeliveryRoundDepartedError,
  TransferBinNotPlacedError,
} from "../../../domain/errors/delivery-loading-errors.js";
import {
  InternalTransferNotFoundError,
  TransferBinsClosedError,
} from "../../../domain/errors/internal-transfer-errors.js";
import {
  FixedTransferredOrders,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "../../__tests__/transfer-doubles.js";
import { DeliveryBinOffice } from "../../delivery-bin-office.js";
import { DeclareTransferBinsCommand } from "../declare-transfer-bins.command.js";
import { DeclareTransferBinsHandler } from "../declare-transfer-bins.handler.js";
import { LoadDeliveryBinCommand } from "../load-delivery-bin.command.js";
import { LoadDeliveryBinHandler } from "../load-delivery-bin.handler.js";
import {
  binTypeOf,
  FixedBinTypeLookup,
  InMemoryBins,
  InMemoryStopLoadings,
  ScriptedDrawer,
  stopOf,
} from "./loading-doubles.js";
import { FixedDeliveryOrders } from "./round-doubles.js";

/*
 * **Les bacs du transfert** (plan du transfert interne, Q-T4 révisée par Hugo
 * le 2026-10-13, lot T3) : les commandes d'un site servi par transfert
 * partent en sacs, et les sacs dans autant de bacs que nécessaire, qui
 * appartiennent au TRANSFERT. Le mécanisme est celui des bacs de commande.
 */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const LATER = new Date(60_000);

/** L'arrêt du transfert `t_1` dans la tournée `r_1`, avec ses bacs. */
function transferStop(overrides: Partial<StopLoadingSnapshot> = {}): StopLoadingSnapshot {
  return stopOf("unused", {
    stopId: "r_1_st",
    subject: { kind: "transfer", transferId: "t_1" },
    roundOrderIds: [null],
    bins: [],
    ...overrides,
  });
}

function transferBin(id: string, code: string): DeliveryBin {
  return DeliveryBin.restore({
    id,
    subject: { kind: "transfer", transferId: "t_1" },
    code,
    binTypeId: "t_m",
    half: null,
    physicalBinId: null,
    innerBags: 3,
    voidedAt: null,
    createdAt: NOW,
  });
}

function declarationScene(
  options: {
    readonly transfer?: ReturnType<typeof plannedTransfer> | null;
    readonly loadings?: InMemoryStopLoadings;
  } = {},
) {
  const transfer =
    options.transfer === undefined ? plannedTransfer("t_1", DAY, NOW, ["o_v"]) : options.transfer;
  const transfers = new InMemoryInternalTransfers(...(transfer === null ? [] : [transfer]));
  const bins = new InMemoryBins();
  const events = new RecordingPublisher();
  const declaration = new DeclareTransferBinsHandler(
    new InternalTransfersReaderOver(transfers),
    bins,
    new FixedBinTypeLookup(binTypeOf("t_m")),
    options.loadings ?? new InMemoryStopLoadings(transferStop()),
    new ScriptedDrawer(["AAAAAA", "BBBBBB", "CCCCCC"]),
    new FixedIdGenerator("bin"),
    new FixedClock(LATER),
    events,
    new DirectUnitOfWork(),
  );
  return { declaration, bins, events };
}

describe("DeclareTransferBinsHandler — déclarer les bacs d'un transfert au chargement", () => {
  it("déclare autant de bacs entiers que demandé, au transfert, et UN fait au journal", async () => {
    const { declaration, bins, events } = declarationScene();

    const ids = await declaration.execute(new DeclareTransferBinsCommand("t_1", "t_m", 3, 2));

    expect(ids).toHaveLength(3);
    expect(ids.map((id) => bins.byId.get(id)?.toSnapshot())).toEqual(
      ["AAAAAA", "BBBBBB", "CCCCCC"].map((code, index) => ({
        id: ids[index],
        subject: { kind: "transfer", transferId: "t_1" },
        binTypeId: "t_m",
        half: null,
        physicalBinId: null,
        innerBags: 2,
        code,
        voidedAt: null,
        createdAt: LATER,
      })),
    );
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "internal_transfer.bins_declared",
        subjectType: "internal_transfer",
        subjectId: "t_1",
        payload: {
          subjectLabel: "Val Village",
          day: DAY,
          binType: { id: "t_m", name: "Bac t_m" },
          innerBags: 2,
          bins: ids.map((id, index) => ({ id, name: ["AAAAAA", "BBBBBB", "CCCCCC"][index] })),
        },
      },
    ]);
  });

  it("déclare aussi pour un transfert encore dans aucune tournée : les bacs attendent son placement", async () => {
    const { declaration, bins } = declarationScene({ loadings: new InMemoryStopLoadings() });

    await declaration.execute(new DeclareTransferBinsCommand("t_1", "t_m", 1, 0));

    expect(bins.byId.size).toBe(1);
  });

  it("refuse un transfert parti ou reçu, sans rien écrire", async () => {
    const departed = plannedTransfer("t_1", DAY, NOW, ["o_v"]);
    departed.depart(NOW, () => []);
    const received = plannedTransfer("t_1", DAY, NOW, ["o_v"]);
    received.receive({ at: NOW, by: "staff_c", reason: "Venu par le personnel" });

    for (const transfer of [departed, received]) {
      const { declaration, bins, events } = declarationScene({ transfer });
      await expect(
        declaration.execute(new DeclareTransferBinsCommand("t_1", "t_m", 1, 0)),
      ).rejects.toThrow(TransferBinsClosedError);
      expect(bins.byId.size).toBe(0);
      expect(events.traced).toEqual([]);
    }
  });

  it("refuse quand la tournée du transfert est partie, et un transfert inconnu", async () => {
    const gone = declarationScene({
      loadings: new InMemoryStopLoadings(transferStop({ departedAt: NOW })),
    });
    await expect(
      gone.declaration.execute(new DeclareTransferBinsCommand("t_1", "t_m", 1, 0)),
    ).rejects.toThrow(DeliveryRoundDepartedError);

    const unknown = declarationScene({ transfer: null });
    await expect(
      unknown.declaration.execute(new DeclareTransferBinsCommand("t_1", "t_m", 1, 0)),
    ).rejects.toThrow(InternalTransferNotFoundError);
  });
});

describe("charger et annuler un bac de transfert (lot T3)", () => {
  const BIN = { id: "b_t", code: "TTTTTT", voided: false, partnerOrderId: null };

  function loadHandler(loadings: InMemoryStopLoadings) {
    const events = new RecordingPublisher();
    const handler = new LoadDeliveryBinHandler(
      new InMemoryBins(transferBin("b_t", "TTTTTT")),
      loadings,
      new FixedDeliveryOrders([]),
      new InternalTransfersReaderOver(
        new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, NOW, ["o_v"])),
      ),
      new FixedIdGenerator("load"),
      new FixedClock(LATER),
      events,
      new DirectUnitOfWork(),
    );
    return { handler, events };
  }

  it("charge le bac dans l'arrêt de son transfert, et le journal cite le transfert par son site", async () => {
    const loadings = new InMemoryStopLoadings(transferStop({ bins: [BIN] }));
    const { handler, events } = loadHandler(loadings);

    await handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_t" }, "staff_1"));

    expect(loadings.stored("t_1")?.loads[0]).toMatchObject({ binId: "b_t", loadedAt: LATER });
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_bin.loaded",
      subjectId: "b_t",
      payload: { transfer: { id: "t_1", name: "Val Village" }, via: "scan" },
    });
    expect(events.traced[0]?.journalFact().payload).not.toHaveProperty("order");
  });

  it("refuse un bac dont le transfert n'est dans aucune tournée, en nommant le site", async () => {
    const { handler } = loadHandler(new InMemoryStopLoadings());

    const refusal = handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_t" }, "staff_1"));

    await expect(refusal).rejects.toThrow(TransferBinNotPlacedError);
    await expect(refusal).rejects.toThrow("« Val Village »");
  });

  it("s'annule dans la tournée de son transfert, et le journal cite le transfert", async () => {
    const bins = new InMemoryBins(transferBin("b_t", "TTTTTT"));
    const events = new RecordingPublisher();
    const office = new DeliveryBinOffice(
      bins,
      new FixedBinTypeLookup(binTypeOf("t_m")),
      new InMemoryStopLoadings(transferStop({ bins: [BIN] })),
      new FixedDeliveryOrders([]),
      new ScriptedDrawer([]),
      new FixedIdGenerator("bin"),
      new FixedClock(LATER),
      events,
      new DirectUnitOfWork(),
      new FixedTransferredOrders(),
      new InternalTransfersReaderOver(
        new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, NOW, ["o_v"])),
      ),
    );

    await office.void("b_t");

    expect(bins.byId.get("b_t")?.voidedAt).toEqual(LATER);
    expect(await office.orderOf("b_t")).toBeNull();
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_bin.voided",
      payload: { subjectLabel: "TTTTTT", transfer: { id: "t_1", name: "Val Village" } },
    });
  });
});
