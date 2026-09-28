import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { BatchStillPackedError } from "../../../domain/errors/batch-errors.js";
import {
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../../../domain/errors/production-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  BatchBackedDays,
  InMemoryBatches,
  RecordingDayLock,
} from "../../__tests__/batch-doubles.js";
import { MarkWorksheetLineCommand } from "../mark-worksheet-line.command.js";
import { MarkWorksheetLineHandler } from "../mark-worksheet-line.handler.js";
import { UnmarkWorksheetLineCommand } from "../unmark-worksheet-line.command.js";
import { UnmarkWorksheetLineHandler } from "../unmark-worksheet-line.handler.js";

/**
 * L'ancienne case de la fiche d'atelier, **traduite en fournées** (plan
 * `plan-fournees-progressives.md`, D3) : cocher = déclarer le reste, décocher =
 * tout annuler. Servie au même contrat tant qu'un front déployé l'appelle.
 *
 * Aucune comparaison à l'horloge ici : ces instants ne sont que recopiés.
 */
const NOW = new Date("2026-09-13T05:10:00.000Z");
const EARLIER = new Date("2026-09-13T04:40:00.000Z");
const DAY = "2026-09-13";
const SKU = "PAI-SEI";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  lines: [{ sku: SKU, productName: "Pain de seigle", quantity: 30 }],
};

/** Une journée déjà arrêtée, qui porte un seul article au compte. */
function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Date("2026-09-13T04:20:00.000Z"));
  return day;
}

/** La même, cochée par l'ANCIEN binaire (`done_*`), sans aucune fournée. */
function legacyChecked(): ProductionDay {
  const snapshot = closedDay().toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    counts: snapshot.counts.map((item) => ({
      ...item,
      done: { at: EARLIER, by: "auth0|karim", initials: "KA" },
    })),
  });
}

/** La même, dont la ligne est au bac — les pièces sont dans un sac. */
function packed(base: ProductionDay): ProductionDay {
  const snapshot = base.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    orders: snapshot.orders.map((order) => ({
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        packed: { at: NOW, by: "staff-2", initials: "" },
      })),
    })),
  });
}

function setup(base: ProductionDay = closedDay()): {
  readonly store: InMemoryBatches;
  readonly days: BatchBackedDays;
  readonly trace: string[];
  readonly mark: MarkWorksheetLineHandler;
  readonly unmark: UnmarkWorksheetLineHandler;
} {
  const trace: string[] = [];
  const store = new InMemoryBatches(trace);
  const days = new BatchBackedDays(base, store, trace);
  const clock = new FixedClock(NOW);
  return {
    store,
    days,
    trace,
    mark: new MarkWorksheetLineHandler(days, store, clock),
    unmark: new UnmarkWorksheetLineHandler(
      days,
      store,
      new RecordingDayLock(trace),
      clock,
      new DirectUnitOfWork(),
    ),
  };
}

describe("MarkWorksheetLineHandler — « rendre la ligne complète »", () => {
  it("déclare le RESTE en une fournée, avec l'horloge et l'identité du guard", async () => {
    const { store, days, mark } = setup();

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    expect(store.batches).toEqual([
      {
        id: `mark-${DAY}-${SKU}-0-0`,
        sku: SKU,
        quantity: 30,
        recorded: { at: NOW, by: "staff-1", initials: "MB" },
        cancelled: null,
      },
    ]);
    // Ni `save` de la journée, ni coche `done_*` : le port n'a plus de quoi l'écrire.
    expect(days.saved).toBe(0);
  });

  it("recocher une ligne complète est un succès SANS effet — recocher passait", async () => {
    const { store, mark } = setup();
    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "KA", "staff-2"));

    expect(store.writes).toHaveLength(1);
    expect(store.batches[0]?.recorded.initials).toBe("MB");
  });

  it("deux cochers simultanés calculent le même id : le second est absorbé", async () => {
    const { store, days, mark } = setup();
    days.stale = true;

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));
    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "KA", "staff-2"));

    expect(store.writes).toHaveLength(1);
  });

  it("🔴 recocher APRÈS un décocher rend la ligne complète de nouveau", async () => {
    // L'écart au plan : avec `mark-<jour>-<sku>-<produced>` seul, le second
    // cocher recalculait l'id de la fournée annulée, et l'idempotence le lisait
    // comme un rejeu — 204, ligne restée vide.
    const { store, mark, unmark } = setup();
    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));
    await unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-1"));

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    const active = store.batches.filter((batch) => batch.cancelled === null);
    expect(active.map((batch) => batch.quantity)).toEqual([30]);
  });

  it("une ligne cochée par l'ANCIEN binaire est déjà complète : rien à écrire", async () => {
    const { store, mark } = setup(legacyChecked());

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    expect(store.writes).toHaveLength(0);
  });

  it("refuse une journée ouverte et un SKU hors compte, sans rien écrire", async () => {
    const open = setup(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(
      open.mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);

    const closed = setup();
    await expect(
      closed.mark.execute(new MarkWorksheetLineCommand(DAY, "INCONNU", "MB", "staff-1")),
    ).rejects.toBeInstanceOf(ProducedItemNotFoundError);
    expect(open.store.writes).toHaveLength(0);
    expect(closed.store.writes).toHaveLength(0);
  });
});

describe("UnmarkWorksheetLineHandler — « tout annuler »", () => {
  it("annule toutes les fournées de la ligne, sous le verrou, au nom du guard", async () => {
    const { store, trace, mark, unmark } = setup();
    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));
    trace.length = 0;

    await unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-9"));

    expect(trace).toEqual([`lock:${DAY}`, "load", `cancel:mark-${DAY}-${SKU}-0-0`]);
    expect(store.batches[0]?.cancelled).toEqual({ at: NOW, by: "staff-9" });
  });

  it("matérialise la coche héritée AVANT de l'annuler — sinon elle renaîtrait", async () => {
    const { store, trace, unmark } = setup(legacyChecked());

    await unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-9"));

    const inherited = `backfill-${DAY}-${SKU}`;
    expect(trace).toEqual([`lock:${DAY}`, "load", `record:${inherited}`, `cancel:${inherited}`]);
    expect(store.batches[0]).toMatchObject({ id: inherited, quantity: 30 });
    expect(store.batches[0]?.cancelled).not.toBeNull();
  });

  it("🔴 REFUSE de décocher une ligne dont des pièces sont dans des sacs", async () => {
    // Le seul changement de comportement de l'ancien contrat, et il est voulu :
    // décocher laisserait le colisage mentir.
    const { store, unmark } = setup(packed(legacyChecked()));

    await expect(
      unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-9")),
    ).rejects.toThrow("30 « Pain de seigle » sont déjà dans des sacs");
    await expect(
      unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-9")),
    ).rejects.toBeInstanceOf(BatchStillPackedError);
    expect(store.writes).toHaveLength(0);
  });

  it("porte les mêmes deux refus structurels que la coche", async () => {
    const open = setup(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(
      open.unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-9")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);

    await expect(
      setup().unmark.execute(new UnmarkWorksheetLineCommand(DAY, "INCONNU", "staff-9")),
    ).rejects.toBeInstanceOf(ProducedItemNotFoundError);
  });
});
