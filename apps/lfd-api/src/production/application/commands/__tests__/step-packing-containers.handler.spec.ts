import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import {
  AtelierSheetNotFoundError,
  ContainerCeilingReachedError,
  ContainerStepConflictError,
  PackedOrderSealedError,
  ProductionDayNotClosedError,
} from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import {
  type ContainerStep,
  MAX_CONTAINERS_PER_ORDER,
} from "../../../domain/value-objects/container-step.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { StepPackingContainersCommand } from "../step-packing-containers.command.js";
import { StepPackingContainersHandler } from "../step-packing-containers.handler.js";

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

/**
 * Le dépôt doublé : il ÉTEND le port. `load` rend les journées **dans l'ordre**,
 * pour jouer une relecture qui ne voit pas le même état que la première ;
 * `stepContainerCount` rend ce qu'on lui dit, pour jouer la base qui n'écrit
 * rien.
 */
class Days extends ProductionDayRepository {
  readonly steps: { reference: string; step: ContainerStep }[] = [];
  saved = 0;
  recorded = 0;

  constructor(
    private readonly loads: readonly ProductionDay[],
    private readonly written = true,
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    const next = this.loads[Math.min(this.steps.length, this.loads.length - 1)];
    return next === undefined
      ? Promise.reject(new Error("aucune journée à charger"))
      : Promise.resolve(next);
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

  recordContainerCount(): Promise<void> {
    this.recorded += 1;
    return Promise.resolve();
  }

  stepContainerCount(_day: ServiceDay, reference: string, step: ContainerStep): Promise<boolean> {
    this.steps.push({ reference, step });
    return Promise.resolve(this.written);
  }
}

function closedDay(containers = 0): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], CLOSED_AT);
  if (containers > 0) {
    day.declareContainers(REFERENCE, containers);
  }
  return day;
}

function sealedDay(): ProductionDay {
  const day = closedDay();
  day.pack(REFERENCE, new Date("2026-09-13T04:50:00.000Z"), "auth0|karim");
  return day;
}

function run(days: Days, step: ContainerStep, reference = REFERENCE): Promise<void> {
  return new StepPackingContainersHandler(days).execute(
    new StepPackingContainersCommand(DAY, reference, step),
  );
}

describe("StepPackingContainersHandler", () => {
  it("confie le pas à la base, et ne calcule AUCUN total", async () => {
    // Un `recordContainerCount` ou un `save` ici rouvrirait la course : deux
    // postes liraient le même compte et écriraient le même nombre.
    const days = new Days([closedDay(3)]);

    await run(days, "add");

    expect(days.steps).toEqual([{ reference: REFERENCE, step: "add" }]);
    expect(days.recorded).toBe(0);
    expect(days.saved).toBe(0);
  });

  it("un « − » que la base n'écrit pas est SANS EFFET, sans erreur", async () => {
    // Retrait à zéro : l'écran n'a pas à comparer le compte à zéro pour savoir
    // s'il peut appuyer.
    const days = new Days([closedDay()], false);

    await expect(run(days, "remove")).resolves.toBeUndefined();
    expect(days.steps).toHaveLength(1);
  });

  it("refuse un « + » au plafond, sans rien écrire", async () => {
    const days = new Days([closedDay(MAX_CONTAINERS_PER_ORDER)]);

    await expect(run(days, "add")).rejects.toBeInstanceOf(ContainerCeilingReachedError);
    expect(days.steps).toHaveLength(0);
  });

  it("🔴 refuse une commande déclarée prête, sans rien écrire", async () => {
    const days = new Days([sealedDay()]);

    await expect(run(days, "add")).rejects.toBeInstanceOf(PackedOrderSealedError);
    await expect(run(days, "remove")).rejects.toBeInstanceOf(PackedOrderSealedError);
    expect(days.steps).toHaveLength(0);
  });

  it("refuse une journée ouverte et une référence hors du plan", async () => {
    await expect(
      run(new Days([ProductionDay.open(ServiceDay.of(DAY))]), "add"),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
    await expect(run(new Days([closedDay()]), "add", "CMD-9999")).rejects.toBeInstanceOf(
      AtelierSheetNotFoundError,
    );
  });

  it("un « + » perdu en base RELIT, et dit la vraie raison — bac fermé entre-temps", async () => {
    // Lu ouvert, écrit fermé : un autre poste a déclaré la commande prête entre
    // les deux instants. C'est la relecture qui le sait, pas la base.
    const days = new Days([closedDay(), sealedDay()], false);

    await expect(run(days, "add")).rejects.toBeInstanceOf(PackedOrderSealedError);
  });

  it("un « + » perdu en base sans raison à la relecture est un CONFLIT, pas un succès", async () => {
    // Rien à refuser à la relecture : l'état a bougé et rebougé. Le taire
    // laisserait croire qu'un container a été ajouté.
    const days = new Days([closedDay(), closedDay()], false);

    await expect(run(days, "add")).rejects.toBeInstanceOf(ContainerStepConflictError);
  });
});
