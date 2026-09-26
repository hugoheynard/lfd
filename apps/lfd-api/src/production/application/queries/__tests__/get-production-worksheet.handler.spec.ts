import {
  SHELF_LABEL_UNKNOWN,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  addDays,
  instantToLocal,
  type CatalogFamilyView,
} from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../channels/commerce/expected-production.reader.js";
import { WorkshopShelvesReader } from "../../../channels/commerce/workshop-shelves.reader.js";
import { ProductionDay, type DoneMark } from "../../../domain/entities/production-day.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { GetProductionWorksheetHandler } from "../get-production-worksheet.handler.js";
import { GetProductionWorksheetQuery } from "../get-production-worksheet.query.js";
import { ProductionWorksheetReading } from "../../services/production-worksheet-reading.service.js";

/**
 * Le jour est DÉRIVÉ de maintenant : `relativeDay` le compare à l'horloge, et un
 * jour en dur deviendrait « ni aujourd'hui ni demain » le lendemain. Le tirage,
 * lui, n'est que recopié dans la vue — exception étroite du §5.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;
const TIRAGE = new Date(NOW.getTime() - 60 * 60 * 1000);

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

/** Les rayons doublés : une table fixe, ou une panne du commerce. */
class Shelves extends WorkshopShelvesReader {
  constructor(private readonly table: ReadonlyMap<string, CatalogFamilyView> | "down") {
    super();
  }

  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    return this.table === "down"
      ? Promise.reject(new Error("catalogue injoignable"))
      : Promise.resolve(this.table);
  }
}

const PAINS: CatalogFamilyView = { id: "fam-pain", name: "Pains", position: 1 };
const SEIGLE_AU_PAIN = new Map<string, CatalogFamilyView>([["PAI-SEI", PAINS]]);

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
  shelves: Shelves = new Shelves(SEIGLE_AU_PAIN),
  commerce: Commerce = new Commerce(producible),
): GetProductionWorksheetHandler {
  return new GetProductionWorksheetHandler(
    new ProductionWorksheetReading(
      new Days(current),
      new Expected(expected),
      commerce,
      new Containers(rules),
      shelves,
      new FixedClock(NOW),
    ),
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
    const handler = handlerFor(
      ProductionDay.open(ServiceDay.of(DAY)),
      [],
      [demandOfDay(30)],
      new Map(),
      new Shelves(SEIGLE_AU_PAIN),
      commerce,
    );

    await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(commerce.asked).toBe(1);
  });

  it("range les lignes par rayon, et dit que les rayons sont connus", async () => {
    const handler = handlerFor(closedDay(), [order("ord_1", 30)], []);

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.shelvesKnown).toBe(true);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({
      key: "fam-pain",
      family: PAINS,
      label: "Pains",
      totalUnits: 30,
    });
    expect(view.groups[0]?.pending[0]).toMatchObject({ sku: "PAI-SEI", done: false });
  });

  it("🔴 SERT la fiche quand les rayons sont illisibles — tout en « Rayon inconnu »", async () => {
    // Les quantités ne dépendent pas du catalogue : refuser la fiche pour un
    // rangement ferait d'un confort une panne de production.
    const handler = handlerFor(
      closedDay(),
      [order("ord_1", 30)],
      [],
      new Map(),
      new Shelves("down"),
    );

    const view = await handler.execute(new GetProductionWorksheetQuery(DAY));

    expect(view.shelvesKnown).toBe(false);
    expect(view.lines).toHaveLength(1);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({
      key: UNSHELVED_WORKSHOP_GROUP_KEY,
      category: null,
      label: SHELF_LABEL_UNKNOWN,
      lineCount: 1,
    });
  });

  it("dit « today », « tomorrow » ou rien, selon l'horloge du SERVEUR", async () => {
    const at = async (day: string) =>
      (
        await handlerFor(ProductionDay.open(ServiceDay.of(day)), [], []).execute(
          new GetProductionWorksheetQuery(day),
        )
      ).relativeDay;

    expect(await at(DAY)).toBe("today");
    expect(await at(addDays(DAY, 1))).toBe("tomorrow");
    expect(await at(addDays(DAY, 7))).toBeNull();
  });
});
