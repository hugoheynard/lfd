import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import {
  AtelierSheetNotFoundError,
  InvalidContainerCountError,
  PackedOrderSealedError,
  ProductionDayNotClosedError,
} from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { DeclarePackingContainersCommand } from "../declare-packing-containers.command.js";
import { DeclarePackingContainersHandler } from "../declare-packing-containers.handler.js";

/** Aucune de ces dates n'est comparée à l'horloge : elles sont recopiées. */
const CLOSED_AT = new Date("2026-09-13T04:20:00.000Z");
const DAY = "2026-09-13";
const REFERENCE = "CMD-0001";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: REFERENCE,
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
};

/** Le dépôt doublé : il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Days extends ProductionDayRepository {
  readonly counts: { reference: string; containers: number }[] = [];
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

  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markProduced(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  recordContainerCount(_day: ServiceDay, reference: string, containers: number): Promise<void> {
    this.counts.push({ reference, containers });
    return Promise.resolve();
  }

  stepContainerCount(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], CLOSED_AT);
  return day;
}

function sealedDay(): ProductionDay {
  const day = closedDay();
  day.pack(REFERENCE, new Date("2026-09-13T04:50:00.000Z"), "auth0|karim");
  return day;
}

describe("DeclarePackingContainersHandler", () => {
  it("grave le nombre de bacs de la commande", async () => {
    const days = new Days(closedDay());

    await new DeclarePackingContainersHandler(days).execute(
      new DeclarePackingContainersCommand(DAY, REFERENCE, 3),
    );

    expect(days.counts).toEqual([{ reference: REFERENCE, containers: 3 }]);
  });

  it("n'écrit PAS la journée entière : c'est une écriture ciblée", async () => {
    // Deux postes tiennent deux bons au même moment ; un `save` de l'agrégat
    // réécrirait la journée et effacerait le travail du voisin.
    const days = new Days(closedDay());

    await new DeclarePackingContainersHandler(days).execute(
      new DeclarePackingContainersCommand(DAY, REFERENCE, 3),
    );

    expect(days.saved).toBe(0);
  });

  it("accepte ZÉRO — c'est une réponse, pas une absence de réponse", async () => {
    const days = new Days(closedDay());

    await new DeclarePackingContainersHandler(days).execute(
      new DeclarePackingContainersCommand(DAY, REFERENCE, 0),
    );

    expect(days.counts).toEqual([{ reference: REFERENCE, containers: 0 }]);
  });

  it("refuse un nombre qui n'en est pas un, sans rien écrire", async () => {
    const days = new Days(closedDay());

    await expect(
      new DeclarePackingContainersHandler(days).execute(
        new DeclarePackingContainersCommand(DAY, REFERENCE, 2.5),
      ),
    ).rejects.toBeInstanceOf(InvalidContainerCountError);
    expect(days.counts).toHaveLength(0);
  });

  it("refuse une journée ouverte et une référence hors du plan", async () => {
    const open = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(
      new DeclarePackingContainersHandler(open).execute(
        new DeclarePackingContainersCommand(DAY, REFERENCE, 1),
      ),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);

    const unknown = new Days(closedDay());
    await expect(
      new DeclarePackingContainersHandler(unknown).execute(
        new DeclarePackingContainersCommand(DAY, "CMD-9999", 1),
      ),
    ).rejects.toBeInstanceOf(AtelierSheetNotFoundError);
  });

  it("🔴 refuse une commande dont le bac est FERMÉ, sans rien écrire", async () => {
    const days = new Days(sealedDay());

    await expect(
      new DeclarePackingContainersHandler(days).execute(
        new DeclarePackingContainersCommand(DAY, REFERENCE, 5),
      ),
    ).rejects.toBeInstanceOf(PackedOrderSealedError);
    expect(days.counts).toHaveLength(0);
  });
});
