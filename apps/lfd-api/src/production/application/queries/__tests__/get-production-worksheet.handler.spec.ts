import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../channels/commerce/expected-production.reader.js";
import { ProductionDay, type DoneMark } from "../../../domain/entities/production-day.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { GetProductionWorksheetHandler } from "../get-production-worksheet.handler.js";
import { GetProductionWorksheetQuery } from "../get-production-worksheet.query.js";
import { ListProductionContainersHandler } from "../list-production-containers.handler.js";

/** Recopié, jamais comparé à l'horloge — exception étroite du §5. */
const TIRAGE = new Date("2026-09-13T04:20:00.000Z");
const DAY = "2026-09-13";

function order(orderId: string, quantity: number): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    lines: [{ sku: "PAI-SEI", productName: "Pain de seigle", quantity }],
  };
}

class Days extends ProductionDayRepository {
  constructor(private readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  markProduced(_day: ServiceDay, _sku: string, _mark: DoneMark | null): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  stepContainerCount(): Promise<boolean> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }
}

class Commerce extends DayOrdersReader {
  asked = 0;

  constructor(private readonly rows: readonly ProducibleOrder[]) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.asked += 1;
    return Promise.resolve(this.rows);
  }
}

class Expected extends ExpectedProductionReader {
  constructor(private readonly rows: readonly ExpectedDayProduction[]) {
    super();
  }

  expectedBetween(): Promise<readonly ExpectedDayProduction[]> {
    return Promise.resolve(this.rows);
  }
}

class Containers extends ProductionContainerReader {
  constructor(private readonly rules: ReadonlyMap<string, ContainerRule>) {
    super();
  }

  allBySku(): Promise<ReadonlyMap<string, ContainerRule>> {
    return Promise.resolve(this.rules);
  }
}

function demandOfDay(quantity: number): ExpectedDayProduction {
  return {
    day: DAY,
    items: [{ sku: "PAI-SEI", productName: "Pain de seigle", quantity }],
    orderCount: 1,
  };
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1", 30)], TIRAGE);
  return day;
}

function handlerFor(
  current: ProductionDay,
  producible: readonly ProducibleOrder[],
  expected: readonly ExpectedDayProduction[],
  rules: ReadonlyMap<string, ContainerRule> = new Map(),
): GetProductionWorksheetHandler {
  return new GetProductionWorksheetHandler(
    new Days(current),
    new Expected(expected),
    new Commerce(producible),
    new Containers(rules),
  );
}

describe("GetProductionWorksheetHandler", () => {
  it("sert la DEMANDE d'une journée ouverte, sans heure ni écart", async () => {
    const handler = handlerFor(
      ProductionDay.open(ServiceDay.of(DAY)),
      [order("ord_1", 30)],
      [demandOfDay(30)],
    );

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.date).toBe(DAY);
    expect(view.generatedAt).toBeNull();
    expect(view.drift).toBeNull();
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatchObject({ sku: "PAI-SEI", quantity: 30 });
  });

  it("rend une fiche VIDE quand le commerce n'annonce rien pour ce jour", async () => {
    // Le port ne rend une entrée que pour les jours qui portent quelque chose :
    // une journée absente de sa réponse n'est pas une erreur, c'est un jour sans
    // rien à fabriquer.
    const handler = handlerFor(ProductionDay.open(ServiceDay.of(DAY)), [], []);

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.lines).toEqual([]);
  });

  it("sert l'INSTANTANÉ d'une journée arrêtée, avec son heure de tirage en ISO", async () => {
    const handler = handlerFor(closedDay(), [order("ord_1", 30)], [demandOfDay(99)]);

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.generatedAt).toBe(TIRAGE.toISOString());
    expect(view.lines[0]?.quantity).toBe(30);
  });

  it("🔴 ÉCARTE les commandes que la journée porte déjà, par `orderId`", async () => {
    // Le bus vit en processus : un abonné en échec laisse des commandes `placed`
    // DÉJÀ inscrites au plan. Sans le filtre, la fiche annoncerait un écart qui
    // n'existe pas et compterait deux fois des pièces déjà au compte.
    const handler = handlerFor(closedDay(), [order("ord_1", 30)], []);

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.drift).toBeNull();
  });

  it("annonce l'écart d'une commande arrivée depuis le tirage", async () => {
    const handler = handlerFor(closedDay(), [order("ord_1", 30), order("ord_2", 12)], []);

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.drift?.orders).toBe(1);
    expect(view.drift?.addedUnits).toBe(12);
    expect(view.drift?.lines).toHaveLength(1);
    expect(view.drift?.lines[0]).toMatchObject({ sku: "PAI-SEI", from: 30, to: 42 });
  });

  it("pose le libellé du contenant sur les lignes réglées", async () => {
    const handler = handlerFor(
      closedDay(),
      [order("ord_1", 30)],
      [],
      new Map([["PAI-SEI", { unitsPerContainer: 8, singular: "plaque", plural: "plaques" }]]),
    );

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.lines[0]?.containerLabel).toBe("4 plaques");
  });

  it("interroge le commerce MÊME sur une journée ouverte — les lectures partent ensemble", async () => {
    // Les quatre lectures sont parallèles : laquelle on jette ne se sait qu'après
    // avoir chargé la journée, et les enchaîner doublerait la latence d'un écran
    // qu'on rafraîchit debout.
    const commerce = new Commerce([order("ord_1", 30)]);
    const handler = new GetProductionWorksheetHandler(
      new Days(ProductionDay.open(ServiceDay.of(DAY))),
      new Expected([demandOfDay(30)]),
      commerce,
      new Containers(new Map()),
    );

    await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(commerce.asked).toBe(1);
  });
});

describe("ListProductionContainersHandler", () => {
  it("rend les réglages triés par SKU", async () => {
    const handler = new ListProductionContainersHandler(
      new Containers(
        new Map([
          ["VIE-CRO", { unitsPerContainer: 12, singular: "plaque", plural: "plaques" }],
          ["PAI-BAG", { unitsPerContainer: 10, singular: "tourneuse", plural: "tourneuses" }],
        ]),
      ),
    );

    const rows = await handler.execute();

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sku)).toEqual(["PAI-BAG", "VIE-CRO"]);
    expect(rows[0]).toEqual({
      sku: "PAI-BAG",
      unitsPerContainer: 10,
      singular: "tourneuse",
      plural: "tourneuses",
    });
  });

  it("rend une liste vide quand rien n'est réglé", async () => {
    const rows = await new ListProductionContainersHandler(new Containers(new Map())).execute();

    expect(rows).toEqual([]);
  });
});
