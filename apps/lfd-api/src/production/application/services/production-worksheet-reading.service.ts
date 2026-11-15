import type { CatalogFamilyView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ExpectedProductionReader } from "../../channels/commerce/expected-production.reader.js";
import {
  OvenWaitingOrdersReader,
  type OvenWaitingOrders,
} from "../../channels/packing/oven-waiting-orders.reader.js";
import { WorkshopShelvesReader } from "../../channels/commerce/workshop-shelves.reader.js";
import { ProductionDisplaySettings } from "../../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsReader } from "../../domain/ports/production-display-settings.reader.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../day/index.js";
import { QualityLineStatusReader } from "../../quality/index.js";
import { worksheetGroupsOf } from "../../domain/services/production-worksheet-groups.js";
import {
  worksheetOf,
  type DemandedItem,
  type Worksheet,
} from "../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../day/index.js";
import { ServiceRange } from "../../day/index.js";
import type { WorksheetContent } from "./worksheet-content.js";
import { WorksheetDeadlinesReading } from "./worksheet-deadlines-reading.service.js";
import { groupView, lineViewOf } from "./worksheet-line-views.js";

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
 * ## Paliers et pastilles (plan `documentation/fournil/la-fiche-d-atelier.md`, §3)
 *
 * Chaque ligne porte ses paliers — ses tranches, rangées par le réglage de
 * l'atelier — et le verdict qualité courant de son SKU, le même que la
 * Supervision, lu par le port que la qualité publie (`QualityLineStatusReader`).
 * Des tranches illisibles laissent la fiche servie, sans paliers. La
 * traduction d'une ligne vers le contrat vit dans `worksheet-line-views.ts`.
 *
 * ## Ce qui attend le four (§3, Hugo, 2026-10-28)
 *
 * Le colisage dit, par SKU, combien de commandes du jour attendent le four et
 * la plus proche heure « prête pour » — la règle de la Supervision, par le
 * port que le fournil déclare. Sans nom de client. Une panne du colisage est
 * **journalisée** et met `waitingOrders: null` partout : la fiche reste servie.
 *
 * ## Sans horloge
 *
 * Le contenu ne lit pas l'heure : il se range tel quel dans l'objet des
 * journées (`WorksheetContents`), et ce qui dépend de maintenant
 * (`relativeDay`) est posé à chaque réponse par `servedWorksheet`. Il dit
 * aussi s'il est complet : rayons, paliers ou attente du four en panne
 * donnent une fiche servie, jamais rangée.
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
    private readonly deadlines: WorksheetDeadlinesReading,
    private readonly quality: QualityLineStatusReader,
    private readonly waiting: OvenWaitingOrdersReader,
    private readonly display: ProductionDisplaySettingsReader,
  ) {}

  /** Le contenu de la fiche d'une journée, sans rien qui dépende de l'heure. */
  async contentOf(day: ServiceDay): Promise<WorksheetContent> {
    // La journée part avec les autres lectures ; les pastilles la suivent, car
    // un verdict se périme contre le compte ACTUEL de la journée.
    const loading = this.days.load(day);
    const [current, expected, producible, containers, tranches, quality, waiting, display] =
      await Promise.all([
        loading,
        this.expected.expectedBetween(ServiceRange.of(day.value, day.value)),
        this.orders.producibleFor(day),
        this.containers.allBySku(),
        this.deadlines.read(day),
        loading.then((loaded) => this.quality.linesOf(loaded)),
        this.waitingOrNull(day),
        this.display.current(),
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
      quality: new Map(quality.map((status) => [status.sku, status])),
      waiting,
    });
    const sheet = {
      date: day.value,
      generatedAt: worksheet.generatedAt?.toISOString() ?? null,
      retakenAt: worksheet.retakenAt?.toISOString() ?? null,
      lines: worksheet.lines.map(viewOf),
      drift: worksheet.drift,
      groups: worksheetGroupsOf(
        worksheet.lines,
        shelves,
        (display ?? ProductionDisplaySettings.defaults()).showSubcategories,
      ).map((group) => groupView(group, viewOf)),
      shelvesKnown: shelves !== null,
    };
    return { sheet, complete: shelves !== null && tranches !== null && waiting !== null };
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
