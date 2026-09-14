import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay, type DoneMark } from "../../../domain/entities/production-day.js";
import {
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { MarkWorksheetLineCommand } from "../mark-worksheet-line.command.js";
import { MarkWorksheetLineHandler } from "../mark-worksheet-line.handler.js";
import { UnmarkWorksheetLineCommand } from "../unmark-worksheet-line.command.js";
import { UnmarkWorksheetLineHandler } from "../unmark-worksheet-line.handler.js";

/** Aucune comparaison à l'horloge ici : cet instant n'est que recopié. */
const NOW = new Date("2026-09-13T05:10:00.000Z");
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

/** Le dépôt doublé : il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Days extends ProductionDayRepository {
  readonly marks: { sku: string; mark: DoneMark | null }[] = [];
  saved = 0;

  constructor(private readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    this.saved += 1;
    return Promise.resolve();
  }

  /** Non utilisé par la coche : rejeter plutôt que rendre une valeur muette. */
  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markProduced(_day: ServiceDay, sku: string, mark: DoneMark | null): Promise<void> {
    this.marks.push({ sku, mark });
    return Promise.resolve();
  }

  /** Non utilisé par la fiche : le bac est le geste de l'autre poste. */
  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Une journée déjà arrêtée, qui porte un seul article au compte. */
function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Date("2026-09-13T04:20:00.000Z"));
  return day;
}

describe("MarkWorksheetLineHandler", () => {
  it("grave la coche avec l'instant de l'HORLOGE et l'identité du guard", async () => {
    const days = new Days(closedDay());
    const handler = new MarkWorksheetLineHandler(days, new FixedClock(NOW));

    await handler.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    expect(days.marks).toHaveLength(1);
    expect(days.marks[0]).toEqual({ sku: SKU, mark: { at: NOW, by: "staff-1", initials: "MB" } });
  });

  it("n'écrit PAS la journée entière : la coche est une écriture ciblée", async () => {
    // Six postes cochent six fiches en même temps ; un `save` de l'agrégat
    // réécrirait la journée et le second écrasement effacerait le premier.
    const days = new Days(closedDay());
    const handler = new MarkWorksheetLineHandler(days, new FixedClock(NOW));

    await handler.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    expect(days.saved).toBe(0);
  });

  it("laisse passer des initiales VIDES — on coche d'abord, on signe si on veut", async () => {
    const days = new Days(closedDay());
    const handler = new MarkWorksheetLineHandler(days, new FixedClock(NOW));

    await handler.execute(new MarkWorksheetLineCommand(DAY, SKU, "", "staff-1"));

    expect(days.marks[0]?.mark).toMatchObject({ initials: "" });
  });

  it("refuse une journée qui n'est pas arrêtée, sans rien écrire", async () => {
    const days = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    const handler = new MarkWorksheetLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
    expect(days.marks).toHaveLength(0);
  });

  it("refuse un SKU absent du compte du jour, sans rien écrire", async () => {
    const days = new Days(closedDay());
    const handler = new MarkWorksheetLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkWorksheetLineCommand(DAY, "INCONNU", "MB", "staff-1")),
    ).rejects.toBeInstanceOf(ProducedItemNotFoundError);
    expect(days.marks).toHaveLength(0);
  });
});

describe("UnmarkWorksheetLineHandler", () => {
  it("efface la coche — le geste est autorisé, contrairement au colisage", async () => {
    const days = new Days(closedDay());
    const handler = new UnmarkWorksheetLineHandler(days);

    await handler.execute(new UnmarkWorksheetLineCommand(DAY, SKU));

    expect(days.marks).toEqual([{ sku: SKU, mark: null }]);
  });

  it("porte les mêmes deux refus que la coche", async () => {
    const open = new UnmarkWorksheetLineHandler(new Days(ProductionDay.open(ServiceDay.of(DAY))));
    await expect(open.execute(new UnmarkWorksheetLineCommand(DAY, SKU))).rejects.toBeInstanceOf(
      ProductionDayNotClosedError,
    );

    const closed = new UnmarkWorksheetLineHandler(new Days(closedDay()));
    await expect(
      closed.execute(new UnmarkWorksheetLineCommand(DAY, "INCONNU")),
    ).rejects.toBeInstanceOf(ProducedItemNotFoundError);
  });
});
