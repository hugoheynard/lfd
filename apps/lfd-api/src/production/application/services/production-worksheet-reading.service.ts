import type { CatalogFamilyView, ProductionWorksheetView, WorkshopLine } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ExpectedProductionReader } from "../../channels/commerce/expected-production.reader.js";
import { WorkshopShelvesReader } from "../../channels/commerce/workshop-shelves.reader.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import {
  worksheetGroupsOf,
  type WorksheetGroup,
} from "../../domain/services/production-worksheet-groups.js";
import {
  worksheetOf,
  type DemandedItem,
  type Worksheet,
  type WorksheetLine,
} from "../../domain/services/production-worksheet.js";
import { relativeDayOf } from "../../domain/services/relative-day.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ServiceRange } from "../../domain/value-objects/service-range.value-object.js";

/**
 * **La lecture d'une fiche d'atelier**, partagée par ses deux routes.
 *
 * La fiche datée et la fiche « en cours » rendent la même vue ; seule change la
 * façon de choisir le jour. Un handler n'en appelle pas un autre (§4) : ils se
 * partagent donc ce service, et chacun garde son cas d'usage nommé.
 *
 * ⚠️ **Les quatre premières lectures partent ENSEMBLE** : aucune ne conditionne
 * les autres. Une journée ouverte n'utilise pas les arrivées, une journée
 * arrêtée n'utilise pas la demande — mais laquelle on jette ne se sait qu'après
 * avoir chargé la journée. Les rayons, eux, attendent : ils portent sur les SKU
 * de la fiche, qu'on ne connaît qu'une fois l'arbitrage fait.
 *
 * ## Une fiche sans rayons reste servie
 *
 * Les quantités ne dépendent pas du catalogue. Si le commerce ne répond pas, la
 * panne est **journalisée**, `shelvesKnown` vaut `false`, et tout va dans
 * « Rayon inconnu » : le fournil sort ses pièces quand même, et l'écran le dit.
 * Refuser la fiche pour un rangement ferait d'un confort une panne de production.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@Injectable()
export class ProductionWorksheetReading {
  private readonly logger = new Logger(ProductionWorksheetReading.name);

  constructor(
    private readonly days: ProductionDayRepository,
    private readonly expected: ExpectedProductionReader,
    private readonly orders: DayOrdersReader,
    private readonly containers: ProductionContainerReader,
    private readonly shelves: WorkshopShelvesReader,
    private readonly clock: Clock,
  ) {}

  async read(day: ServiceDay): Promise<ProductionWorksheetView> {
    const [current, expected, producible, containers] = await Promise.all([
      this.days.load(day),
      this.expected.expectedBetween(ServiceRange.of(day.value, day.value)),
      this.orders.producibleFor(day),
      this.containers.allBySku(),
    ]);

    // 🔴 Le filtre par `orderId` n'est pas un confort. La clôture publie un
    // événement en processus, ni persisté ni rejoué : un abonné en échec laisse
    // des commandes `placed` DÉJÀ inscrites au plan. Sans lui, la fiche
    // annoncerait un écart qui n'existe pas, et le bandeau promettrait
    // d'absorber des pièces déjà comptées.
    const known = new Set(current.orders.map((order) => order.orderId));
    const worksheet = worksheetOf({
      closedAt: current.closedAt,
      retakenAt: current.retaken?.at ?? null,
      counts: current.counts,
      demand: demandOf(expected, day),
      arrivals: producible.filter((order) => !known.has(order.orderId)),
      containers,
    });
    const shelves = await this.shelvesOrNull(day, worksheet.lines);
    return {
      date: day.value,
      generatedAt: worksheet.generatedAt?.toISOString() ?? null,
      retakenAt: worksheet.retakenAt?.toISOString() ?? null,
      lines: worksheet.lines.map(lineView),
      drift: worksheet.drift,
      groups: worksheetGroupsOf(worksheet.lines, shelves).map(groupView),
      shelvesKnown: shelves !== null,
      relativeDay: relativeDayOf(day.value, this.clock.now()),
    };
  }

  /**
   * Les rayons, ou `null` si le commerce n'a pas répondu — **jamais en silence** :
   * la panne part au journal avec le jour et sa cause.
   */
  private async shelvesOrNull(
    day: ServiceDay,
    lines: Worksheet["lines"],
  ): Promise<ReadonlyMap<string, CatalogFamilyView> | null> {
    if (lines.length === 0) {
      return new Map();
    }
    try {
      return await this.shelves.shelvesOf(lines.map((line) => line.sku));
    } catch (error) {
      this.logger.error(
        `Fiche d'atelier du ${day.value} : rayons illisibles, servie en « Rayon inconnu ».`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}

/** Ce que le commerce annonce pour CE jour — rien du tout s'il ne dit rien. */
function demandOf(
  expected: readonly { readonly day: string; readonly items: readonly DemandedItem[] }[],
  day: ServiceDay,
): readonly DemandedItem[] {
  return expected.find((entry) => entry.day === day.value)?.items ?? [];
}

/** Le domaine parle en `Date`, le contrat en ISO. La traduction vit ici. */
function lineView(line: WorksheetLine): WorkshopLine {
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    containerLabel: line.containerLabel,
    done: line.done,
    initials: line.initials,
    doneAt: line.doneAt?.toISOString() ?? null,
  };
}

function groupView(group: WorksheetGroup): ProductionWorksheetView["groups"][number] {
  return {
    ...group,
    lines: group.lines.map(lineView),
    pending: group.pending.map(lineView),
    done: group.done.map(lineView),
  };
}
