import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PackingSheetSnapshot } from "../../../domain/entities/packing-sheet.js";
import { UnallocatedLinesError } from "../../../domain/errors/packing-container-errors.js";
import { PackingOrderNotDrawnYetError } from "../../../domain/errors/packing-station-errors.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { InMemorySheets, RecordingDurable } from "../../__tests__/station-doubles.js";
import { ClosePackingOrderCommand } from "../close-packing-order.command.js";
import { ClosePackingOrderHandler } from "../close-packing-order.handler.js";
import { ReopenPackingOrderCommand } from "../reopen-packing-order.command.js";
import { ReopenPackingOrderHandler } from "../reopen-packing-order.handler.js";

// Un jour et des instants comparés entre eux, jamais à l'horloge.
const DAY = "2030-03-12";
const FIRST = new Date(1_000);
const LATER = new Date(2_000);
const PACKED = "packing.order_packed";

/** Un refus de la livraison, tel qu'il remonte par `BinDesk`. */
class BinLoadedRefusal extends BusinessError {
  constructor() {
    super("delivery.bin_loaded", "Le bac est chargé : déchargez-le d'abord.");
  }
}

function sheet(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return {
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: null,
    containers: 1,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 4, packed: null }],
    containerMode: "listed",
    containerList: [
      {
        id: "ctn_1",
        nature: "bin",
        bin: { binId: "bin_1", code: "AB12", half: null },
        opened: { at: FIRST, by: "s1" },
        voided: null,
        lines: [{ sku: "CRO", quantity: 4 }],
      },
    ],
    fulfillmentMethod: "delivery",
    ...overrides,
  };
}

/** La ligne entièrement répartie — la fermeture est permise. */
function filled(overrides: Partial<PackingSheetSnapshot> = {}): PackingSheetSnapshot {
  return sheet({
    lines: [
      {
        sku: "CRO",
        productName: "Croissant",
        quantity: 4,
        packed: { at: FIRST, by: "s1", initials: "" },
      },
    ],
    ...overrides,
  });
}

function setup(snapshot: PackingSheetSnapshot) {
  const sheets = new InMemorySheets();
  sheets.put(snapshot);
  const durable = new RecordingDurable();
  const desk = new ScriptedBinDesk();
  const clock = new FixedClock(FIRST);
  const uow = new DirectUnitOfWork();
  return {
    sheets,
    durable,
    desk,
    clock,
    close: new ClosePackingOrderHandler(sheets, durable, clock, uow),
    reopen: new ReopenPackingOrderHandler(sheets, desk, uow),
  };
}

describe("ClosePackingOrderHandler — « Déclarer prête » au colisage", () => {
  it("ferme le bac et publie packing.order_packed sous la clé de la commande", async () => {
    const { close, sheets, durable } = setup(filled());

    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s2"));

    expect(sheets.of(DAY, "ord_1")?.packed).toEqual({ at: FIRST, by: "s2" });
    expect(durable.of(PACKED).map((fact) => [fact.key, fact.payload])).toEqual([
      [
        `${PACKED}:ord_1`,
        { orderId: "ord_1", reference: "CMD-0001", packedAt: FIRST.toISOString(), packedBy: "s2" },
      ],
    ]);
  });

  it("refuse une ligne pas entièrement répartie, et ne publie rien", async () => {
    const { close, sheets, durable } = setup(sheet({ containerList: [], containers: 0 }));

    await expect(close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s2"))).rejects.toThrow(
      UnallocatedLinesError,
    );
    expect(sheets.of(DAY, "ord_1")?.packed).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("refuse une commande que la liste à coliser n'a pas encore livrée", async () => {
    const { close } = setup(filled());

    await expect(
      close.execute(new ClosePackingOrderCommand(DAY, "ord_absent", "s2")),
    ).rejects.toThrow(PackingOrderNotDrawnYetError);
  });

  it("un bac déjà fermé republie le fait d'origine sous une clé neuve, sans réécrire", async () => {
    const { close, sheets, durable, clock } = setup(filled({ packed: { at: FIRST, by: "s1" } }));
    clock.set(LATER);

    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s2"));

    expect(sheets.of(DAY, "ord_1")?.packed).toEqual({ at: FIRST, by: "s1" });
    expect(durable.of(PACKED).map((fact) => [fact.key, fact.payload])).toEqual([
      [
        `${PACKED}:ord_1:reannounced:${LATER.toISOString()}`,
        { orderId: "ord_1", reference: "CMD-0001", packedAt: FIRST.toISOString(), packedBy: "s1" },
      ],
    ]);
  });
});

describe("ReopenPackingOrderHandler — rouvrir le rangement (option b)", () => {
  it("rouvre le bac, garde lignes et contenants, et ne publie rien", async () => {
    const { reopen, sheets, durable, desk } = setup(filled({ packed: { at: FIRST, by: "s1" } }));

    await reopen.execute(new ReopenPackingOrderCommand(DAY, "ord_1"));

    const after = sheets.of(DAY, "ord_1");
    expect(after?.packed).toBeNull();
    expect(after?.lines[0]?.packed).toEqual({ at: FIRST, by: "s1", initials: "" });
    expect(after?.containerList).toHaveLength(1);
    expect(desk.checkedAtHand).toEqual([{ orderId: "ord_1", binIds: ["bin_1"] }]);
    expect(durable.facts).toEqual([]);
  });

  it("🔴 refusé par la livraison (bac chargé, tournée partie) : rien n'est rouvert", async () => {
    const { reopen, sheets, desk } = setup(filled({ packed: { at: FIRST, by: "s1" } }));
    desk.refusal = new BinLoadedRefusal();

    await expect(reopen.execute(new ReopenPackingOrderCommand(DAY, "ord_1"))).rejects.toThrow(
      BinLoadedRefusal,
    );
    expect(sheets.of(DAY, "ord_1")?.packed).toEqual({ at: FIRST, by: "s1" });
  });

  it("ne demande rien à la livraison pour un contenant annulé", async () => {
    const base = filled({ packed: { at: FIRST, by: "s1" } });
    const voided = base.containerList.map((container) => ({
      ...container,
      voided: { at: FIRST, by: "s1" },
    }));
    const { reopen, desk } = setup({ ...base, containerList: voided });

    await reopen.execute(new ReopenPackingOrderCommand(DAY, "ord_1"));

    expect(desk.checkedAtHand).toEqual([{ orderId: "ord_1", binIds: [] }]);
  });

  it("un bac déjà ouvert n'écrit rien et ne demande rien", async () => {
    const { reopen, desk } = setup(filled());

    await reopen.execute(new ReopenPackingOrderCommand(DAY, "ord_1"));

    expect(desk.checkedAtHand).toEqual([]);
  });

  it("🔴 refermer après rouvrir ne republie rien de neuf : même clé, absorbée", async () => {
    const { close, reopen, durable, clock } = setup(filled());
    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s1"));
    await reopen.execute(new ReopenPackingOrderCommand(DAY, "ord_1"));
    clock.set(LATER);

    await close.execute(new ClosePackingOrderCommand(DAY, "ord_1", "s2"));

    expect(durable.of(PACKED)).toHaveLength(1);
    expect(durable.of(PACKED)[0]?.key).toBe(`${PACKED}:ord_1`);
  });
});
