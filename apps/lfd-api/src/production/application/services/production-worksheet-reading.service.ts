import type {
  CatalogFamilyView,
  ProductionWorksheetView,
  QualityLineStatus,
  WorkshopLine,
  WorkshopWaitingOrders,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ExpectedProductionReader } from "../../channels/commerce/expected-production.reader.js";
import {
  OvenWaitingOrdersReader,
  type OvenWaitingOrders,
} from "../../channels/packing/oven-waiting-orders.reader.js";
import { WorkshopShelvesReader } from "../../channels/commerce/workshop-shelves.reader.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { deadlinesOf } from "../../domain/services/production-deadlines.js";
import type { TrancheThreshold } from "../../domain/services/production-tranches.js";
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
import { qualityLinesOf } from "./quality-views.js";
import { WorksheetDeadlinesReading } from "./worksheet-deadlines-reading.service.js";

/**
 * **La lecture d'une fiche d'atelier**, partagée par ses deux routes.
 *
 * La fiche datée et la fiche « en cours » rendent la même vue ; seule change la
 * façon de choisir le jour. Un handler n'en appelle pas un autre (§4) : ils se
 * partagent donc ce service, et chacun garde son cas d'usage nommé.
 *
 * ⚠️ **Les premières lectures partent ENSEMBLE** : aucune ne conditionne
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
 * ## Paliers et pastilles (plan `documentation/fournil/plan-fournee-v3.md`, §3)
 *
 * Chaque ligne porte ses paliers — ses tranches, rangées par le réglage de
 * l'atelier — et le verdict qualité courant de son SKU, le même que la
 * Supervision. Des tranches illisibles laissent la fiche servie, sans paliers.
 *
 * ## Ce qui attend le four (§3, Hugo, 2026-10-28)
 *
 * Le colisage dit, par SKU, combien de commandes du jour attendent le four et
 * la plus proche heure « prête pour » — la règle de la Supervision, par le
 * port que le fournil déclare. Sans nom de client. Une panne du colisage est
 * **journalisée** et met `waitingOrders: null` partout : la fiche reste servie.
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
    private readonly deadlines: WorksheetDeadlinesReading,
    private readonly checks: QualityCheckReader,
    private readonly waiting: OvenWaitingOrdersReader,
  ) {}

  async read(day: ServiceDay): Promise<ProductionWorksheetView> {
    const [current, expected, producible, containers, tranches, checks, waiting] =
      await Promise.all([
        this.days.load(day),
        this.expected.expectedBetween(ServiceRange.of(day.value, day.value)),
        this.orders.producibleFor(day),
        this.containers.allBySku(),
        this.deadlines.read(day),
        this.checks.forDay(day),
        this.waitingOrNull(day),
      ]);

    // 🔴 Le filtre par `orderId` n'est pas un confort. La clôture publie un
    // événement en processus, ni persisté ni rejoué : un abonné en échec laisse
    // des commandes `placed` DÉJÀ inscrites au plan. Sans lui, la fiche
    // annoncerait un écart qui n'existe pas, et le bandeau promettrait
    // d'absorber des pièces déjà comptées.
    const known = new Set(current.orders.map((order) => order.orderId));
    const worksheet = worksheetOf({
      serviceDay: day.value,
      closedAt: current.closedAt,
      retakenAt: current.retaken?.at ?? null,
      counts: current.counts,
      batches: current.batches,
      demand: demandOf(expected, day),
      arrivals: producible.filter((order) => !known.has(order.orderId)),
      containers,
    });
    const shelves = await this.shelvesOrNull(day, worksheet.lines);
    const viewOf = lineViewOf({
      tranches,
      quality: new Map(qualityLinesOf(current, checks).map((status) => [status.sku, status])),
      waiting,
    });
    return {
      date: day.value,
      generatedAt: worksheet.generatedAt?.toISOString() ?? null,
      retakenAt: worksheet.retakenAt?.toISOString() ?? null,
      lines: worksheet.lines.map(viewOf),
      drift: worksheet.drift,
      groups: worksheetGroupsOf(worksheet.lines, shelves).map((group) => groupView(group, viewOf)),
      shelvesKnown: shelves !== null,
      relativeDay: relativeDayOf(day.value, this.clock.now()),
    };
  }

  /**
   * Ce qui attend le four, ou `null` si le colisage n'a pas répondu — la panne
   * part au journal avec le jour et sa cause, jamais en silence.
   */
  private async waitingOrNull(
    day: ServiceDay,
  ): Promise<ReadonlyMap<string, OvenWaitingOrders> | null> {
    try {
      return await this.waiting.waitingOn(day.value);
    } catch (error) {
      this.logger.error(
        `Fiche d'atelier du ${day.value} : commandes en attente du four illisibles, servie sans.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
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

/** Ce que la ligne lit hors de la journée : ses tranches, son verdict. */
interface LineMarks {
  /** `null` = tranches illisibles : la ligne part sans paliers. */
  readonly tranches: ReadonlyMap<string, readonly TrancheThreshold[]> | null;
  readonly quality: ReadonlyMap<string, QualityLineStatus>;
  /** `null` = le colisage n'a pas répondu : aucune ligne n'affirme rien. */
  readonly waiting: ReadonlyMap<string, OvenWaitingOrders> | null;
}

/** Le domaine parle en `Date`, le contrat en ISO. La traduction vit ici. */
function lineViewOf(marks: LineMarks): (line: WorksheetLine) => WorkshopLine {
  return (line) => ({
    ...lineView(line),
    deadlines:
      marks.tranches === null
        ? []
        : deadlinesOf(line.quantity, marks.tranches.get(line.sku) ?? []).map((step) => ({
            ...step,
          })),
    quality: marks.quality.get(line.sku) ?? null,
    waitingOrders: waitingOf(marks.waiting, line.sku),
  });
}

/** Une copie au contrat ; `null` = aucune commande, ou colisage muet. */
function waitingOf(
  waiting: ReadonlyMap<string, OvenWaitingOrders> | null,
  sku: string,
): WorkshopWaitingOrders | null {
  const found = waiting?.get(sku);
  return found === undefined
    ? null
    : { count: found.count, earliestHandover: found.earliestHandover };
}

function lineView(line: WorksheetLine): WorkshopLine {
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    containerLabel: line.containerLabel,
    done: line.done,
    initials: line.initials,
    doneAt: line.doneAt?.toISOString() ?? null,
    produced: line.produced,
    remaining: line.remaining,
    surplus: line.surplus,
    batches: line.batches.map((batch) => ({
      id: batch.id,
      quantity: batch.quantity,
      recordedAt: batch.recorded.at.toISOString(),
      initials: batch.recorded.initials === "" ? null : batch.recorded.initials,
      pendingReturn: batch.pendingReturn,
    })),
    pendingReturn: line.pendingReturn,
    container:
      line.container === null
        ? null
        : {
            unitsPerContainer: line.container.unitsPerContainer,
            singular: line.container.singular,
          },
  };
}

function groupView(
  group: WorksheetGroup,
  viewOf: (line: WorksheetLine) => WorkshopLine,
): ProductionWorksheetView["groups"][number] {
  return {
    ...group,
    lines: group.lines.map(viewOf),
    pending: group.pending.map(viewOf),
    done: group.done.map(viewOf),
  };
}
